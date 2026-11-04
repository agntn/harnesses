/**
 * Normalized MCP server management across harness config dialects.
 *
 * Reads and writes work for every declared config file. JSON writes are a
 * parse/serialize round trip. TOML configs (codex, grok) carry user comments
 * that a round trip would destroy, so TOML writes are surgical line edits:
 * only the target server's section is removed or appended, the result is
 * re-parsed and checked against the intended state before anything is
 * written, and every write lands atomically via a temp file rename. OpenBot
 * keeps its servers as rows of a SQLite table, which `mcp-sqlite.ts` edits
 * one row per server.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { readIfExists } from "./files.ts";
import type { Harness } from "./harness.ts";
import { parseJsonc } from "./jsonc.ts";
import {
  McpLimitError,
  openBotServer,
  readSqliteServers,
  removeSqliteServer,
  upsertSqliteServer,
} from "./mcp-sqlite.ts";
import { agntnConfigDir } from "./resolve.ts";
import type { EvidenceLevel, McpConfigFile, McpServerConfig, ResolveOptions } from "./types.ts";

/** One resolved config file together with the servers it declares. */
export interface McpConfigListing {
  path: string;
  scope: McpConfigFile["scope"];
  format: McpConfigFile["format"];
  level: EvidenceLevel;
  note?: string;
  exists: boolean;
  servers: McpServerConfig[];
  /** Set when the file exists but could not be parsed. */
  error?: string;
}

/**
 * MCP config project paths are anchored to the project root, unlike the
 * plain candidate surface which leaves them relative for display.
 *
 * @param harness - Harness whose MCP config paths should be resolved.
 * @param options - Platform and path-resolution overrides.
 * @returns {Array<{ entry: McpConfigFile, path: string }>} Resolved config descriptors.
 */
function resolveConfigs(
  harness: Harness,
  options: ResolveOptions,
): Array<{ entry: McpConfigFile; path: string }> {
  return harness.resolveCandidates(harness.mcpConfigs, options).map((entry) => ({
    entry,
    path: isAbsolute(entry.path)
      ? entry.path
      : join(options.projectRoot ?? process.cwd(), entry.path),
  }));
}

function drill(
  /* oxlint-disable-next-line typescript/prefer-readonly-parameter-types */
  root: Record<string, unknown>,
  key: readonly string[],
  create?: "create",
): Record<string, unknown> | undefined {
  let node: unknown = root;
  for (const part of key) {
    if (typeof node !== "object" || node === null) return undefined;
    const record = node as Record<string, unknown>;
    if (create && (typeof record[part] !== "object" || record[part] === null)) {
      record[part] = {};
    }
    node = record[part];
  }
  return typeof node === "object" && node !== null ? (node as Record<string, unknown>) : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isObjectRecord(value) || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Builds an object with the undefined-valued keys left out.
 *
 * @param source - Object whose undefined properties should be omitted.
 * @returns {T} The compacted object.
 */
function compact<T extends Record<string, unknown>>(source: T): T {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function booleanField(record: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function normalizeAntigravity(
  name: string,
  raw: Readonly<Record<string, unknown>>,
): McpServerConfig {
  const url = stringField(raw, "serverUrl");
  return compact({
    name,
    transport: url ? ("sse" as const) : ("stdio" as const),
    command: stringField(raw, "command"),
    args: asStringArray(raw.args),
    env: asStringRecord(raw.env),
    url,
  });
}

function normalizeOpenCode(name: string, raw: Readonly<Record<string, unknown>>): McpServerConfig {
  const command = asStringArray(raw.command) ?? [];
  const url = stringField(raw, "url");
  return compact({
    name,
    transport: raw.type === "remote" || url ? ("http" as const) : ("stdio" as const),
    command: command[0],
    args: command.length > 1 ? command.slice(1) : undefined,
    env: asStringRecord(raw.environment),
    url,
    headers: asStringRecord(raw.headers),
    enabled: booleanField(raw, "enabled"),
  });
}

function standardUrl(raw: Readonly<Record<string, unknown>>): string | undefined {
  return stringField(raw, "httpUrl") ?? stringField(raw, "url");
}

function standardTransport(
  declared: string | undefined,
  url: string | undefined,
): McpServerConfig["transport"] {
  if (declared === "sse") return "sse";
  if (declared === "http" || url) return "http";
  return "stdio";
}

function normalizeStandard(name: string, raw: Readonly<Record<string, unknown>>): McpServerConfig {
  const url = standardUrl(raw);
  return compact({
    name,
    transport: standardTransport(stringField(raw, "type"), url),
    command: stringField(raw, "command"),
    args: asStringArray(raw.args),
    env: asStringRecord(raw.env),
    url,
    headers: asStringRecord(raw.headers),
    enabled: booleanField(raw, "enabled"),
  });
}

/** An env value that is exactly `${NAME}` stands for the variable NAME of the harness environment. */
const ENV_REFERENCE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/** Thrown when a server's env cannot be written the way the target dialect requires. */
export class McpEnvError extends Error {
  override readonly name = "McpEnvError";
}

/** Thrown when the target dialect cannot carry a server's transport. */
export class McpTransportError extends Error {
  override readonly name = "McpTransportError";
}

export { McpLimitError };

function envReference(value: string): string | undefined {
  return ENV_REFERENCE.exec(value)?.[1];
}

/**
 * Reads a Prime Agent env map, where each value is a {"env": "NAME"}
 * reference, into the shared `${NAME}` spelling. Literal strings are kept
 * as found so the listing shows what the file holds.
 *
 * @param value - Raw `env` field of a Prime Agent server entry.
 * @returns {Record<string, string> | undefined} The env map, or undefined when empty.
 */
function primeEnv(value: unknown): Record<string, string> | undefined {
  if (!isObjectRecord(value) || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw;
    else if (isObjectRecord(raw) && typeof raw.env === "string") out[key] = `\${${raw.env}}`;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Codex reads HTTP headers from `http_headers` only, so that is where they go.
 *
 * @param name - Server name from the containing map.
 * @param raw - Raw Codex server entry.
 * @returns {McpServerConfig} The normalized server entry.
 */
function normalizeCodex(name: string, raw: Readonly<Record<string, unknown>>): McpServerConfig {
  return compact({ ...normalizeStandard(name, raw), headers: asStringRecord(raw.http_headers) });
}

function normalizePrime(name: string, raw: Readonly<Record<string, unknown>>): McpServerConfig {
  return compact({ ...normalizeStandard(name, raw), env: primeEnv(raw.env) });
}

/**
 * Stdio from `command`, HTTP from `url`, SSE settled at connect time: `type` says nothing here.
 *
 * @param name - Server name from the containing map.
 * @param raw - Raw Mastra Code server entry.
 * @returns {McpServerConfig} The normalized server entry.
 */
function normalizeMastracode(
  name: string,
  raw: Readonly<Record<string, unknown>>,
): McpServerConfig {
  const url = stringField(raw, "url");
  return compact({
    name,
    transport: url ? ("http" as const) : ("stdio" as const),
    command: stringField(raw, "command"),
    args: asStringArray(raw.args),
    env: asStringRecord(raw.env),
    url,
    headers: asStringRecord(raw.headers),
  });
}

/**
 * Maps one raw config entry to the normalized shape, per dialect.
 *
 * @param name - Server name from the containing map.
 * @param raw - Raw dialect-specific server entry.
 * @param dialect - Harness config dialect.
 * @returns {McpServerConfig} The normalized server entry.
 */
function normalizeEntry(
  name: string,
  raw: Readonly<Record<string, unknown>>,
  dialect: McpConfigFile["dialect"],
): McpServerConfig {
  if (dialect === "antigravity") return normalizeAntigravity(name, raw);
  if (dialect === "mastracode") return normalizeMastracode(name, raw);
  if (dialect === "opencode") return normalizeOpenCode(name, raw);
  if (dialect === "prime") return normalizePrime(name, raw);
  if (dialect === "codex") return normalizeCodex(name, raw);
  return normalizeStandard(name, raw);
}

function denormalizeAntigravity(server: McpServerConfig): Record<string, unknown> {
  if (server.url) return { serverUrl: server.url };
  return compact({
    command: server.command,
    args: server.args?.length ? server.args : undefined,
    env: server.env,
  });
}

function denormalizeOpenCode(server: McpServerConfig): Record<string, unknown> {
  if (server.url) {
    return compact({
      type: "remote",
      url: server.url,
      headers: server.headers,
      enabled: server.enabled,
    });
  }
  return compact({
    type: "local",
    command: [server.command ?? "", ...(server.args ?? [])],
    environment: server.env,
    enabled: server.enabled,
  });
}

function denormalizeMastracode(server: McpServerConfig): Record<string, unknown> {
  if (server.url) return compact({ url: server.url, headers: server.headers });
  return compact({
    command: server.command,
    args: server.args?.length ? server.args : undefined,
    env: server.env,
  });
}

function denormalizeStandard(server: McpServerConfig): Record<string, unknown> {
  return compact({
    type: server.transport,
    command: server.command,
    args: server.args?.length ? server.args : undefined,
    env: server.env,
    url: server.url,
    headers: server.headers,
    enabled: server.enabled,
  });
}

/**
 * Prime Agent's kernel hands stdio servers a trimmed environment plus the
 * variables the entry names, so its env map holds references only. A
 * literal has no way in and is refused rather than written as a server
 * that fails on its first connection.
 *
 * @param server - Normalized server whose env values are `${NAME}` references.
 * @returns {Record<string, unknown>} The Prime Agent entry.
 */
function denormalizePrime(server: McpServerConfig): Record<string, unknown> {
  const env = server.env
    ? Object.fromEntries(
        Object.entries(server.env).map(([key, value]) => [
          key,
          { env: requirePrimeReference(server, key, value) },
        ]),
      )
    : undefined;
  return compact({ ...denormalizeStandard(server), env });
}

function requirePrimeReference(server: McpServerConfig, key: string, value: string): string {
  const reference = envReference(value);
  if (reference === undefined) {
    throw new McpEnvError(
      `${server.name}: Prime Agent takes only environment references in env; write ${key} as "\${NAME}" and export NAME where prime-agent runs`,
    );
  }
  return reference;
}

/**
 * Shapes a server's env and headers for one dialect before it is compared or written:
 * Prime Agent keeps `${NAME}` references in env and refuses literals there, every other
 * dialect gets the references resolved from the environment of this
 * process, the same way `~` and `${HOME}` are expanded before a sync. A header
 * value may hold its reference inside a longer string, such as `Bearer ${TOKEN}`.
 *
 * @param server - Normalized server, possibly carrying references.
 * @param dialect - Target harness config dialect.
 * @returns {McpServerConfig} The server as the dialect can hold it.
 */
function resolveEnvReferences(
  server: McpServerConfig,
  dialect: McpConfigFile["dialect"],
): McpServerConfig {
  if (dialect === "prime") {
    for (const [key, value] of Object.entries(server.env ?? {}))
      requirePrimeReference(server, key, value);
  }
  const env = server.env && dialect !== "prime" ? resolvedEnv(server, server.env) : server.env;
  const headers = server.headers && resolvedHeaders(server, server.headers);
  return compact({ ...server, env, headers });
}

function resolvedEnv(
  server: McpServerConfig,
  env: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const reference = envReference(value);
    out[key] = reference === undefined ? value : envValue(server, `env ${key}`, reference);
  }
  return out;
}

/**
 * Fills every reference inside header values; a header carries it inside a longer value, as in "Bearer ${TOKEN}".
 *
 * @param server - Server the headers belong to, for the error.
 * @param headers - Header values, possibly holding references.
 * @returns {Record<string, string>} The headers with values filled in.
 * @throws {McpEnvError} When a referenced variable is not set.
 */
function resolvedHeaders(
  server: McpServerConfig,
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = value.replaceAll(ENV_REFERENCE_INSIDE, (_, reference: string) =>
      envValue(server, `header ${key}`, reference),
    );
  }
  return out;
}

/** Every `${NAME}` inside a header value. */
const ENV_REFERENCE_INSIDE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Reads one referenced variable from the environment of this process.
 *
 * @param server - Server the reference belongs to, for the error.
 * @param field - Where the reference sits, e.g. "env TOKEN" or "header Authorization".
 * @param reference - Variable name.
 * @returns {string} The value.
 * @throws {McpEnvError} When the variable is not set.
 */
function envValue(server: McpServerConfig, field: string, reference: string): string {
  // process.env inherits Object.prototype, so a bare lookup would turn
  // ${constructor} into a function; only own string values count.
  const resolved = Object.hasOwn(process.env, reference) ? process.env[reference] : undefined;
  if (typeof resolved !== "string") {
    throw new McpEnvError(
      `${server.name}: ${field} references ${reference}, which is not set in this environment`,
    );
  }
  return resolved;
}

/** Dialects that take stdio and streamable HTTP only, by the name a refusal gives the harness. */
const WITHOUT_SSE: Readonly<Partial<Record<McpConfigFile["dialect"], string>>> = {
  openbot: "OpenBot",
  pi: "Pi",
};

/**
 * Env references per {@link resolveEnvReferences}, minus `sse` and `enabled` for Mastra Code.
 * Pi and OpenBot reject `sse`, and an sse url is rarely the streamable HTTP endpoint, so it's
 * refused. OpenBot rows go through {@link openBotServer} for their names and their `enabled`.
 *
 * @param server - Normalized server from the master list or a caller.
 * @param dialect - Target harness config dialect.
 * @returns {McpServerConfig} The server as the dialect can hold it.
 */
function shapeForDialect(
  server: McpServerConfig,
  dialect: McpConfigFile["dialect"],
): McpServerConfig {
  const shaped = resolveEnvReferences(server, dialect);
  const withoutSse = WITHOUT_SSE[dialect];
  if (withoutSse && shaped.transport === "sse") {
    throw new McpTransportError(
      `${server.name}: ${withoutSse} takes stdio and streamable HTTP servers, not sse; point url at the server's streamable HTTP endpoint`,
    );
  }
  if (dialect === "openbot") return openBotServer(shaped);
  if (dialect !== "mastracode") return shaped;
  return compact({
    ...shaped,
    transport: shaped.url ? ("http" as const) : ("stdio" as const),
    enabled: undefined,
  });
}

/**
 * Converts a normalized server back to the raw shape one dialect expects.
 *
 * @param server - Normalized server configuration.
 * @param dialect - Target harness config dialect.
 * @returns {Record<string, unknown>} The dialect-specific entry.
 */
function denormalizeEntry(
  server: McpServerConfig,
  dialect: McpConfigFile["dialect"],
): Record<string, unknown> {
  if (dialect === "antigravity") return denormalizeAntigravity(server);
  if (dialect === "mastracode") return denormalizeMastracode(server);
  if (dialect === "opencode") return denormalizeOpenCode(server);
  if (dialect === "prime") return denormalizePrime(server);
  return denormalizeStandard(server);
}

/** Entry fields the standard family reads or writes; Pi keeps the rest on a replace. */
const STANDARD_FIELDS: ReadonlySet<string> = new Set([
  "type",
  "command",
  "args",
  "env",
  "url",
  "httpUrl",
  "headers",
  "enabled",
]);

/**
 * A Pi entry that keeps its transport keeps `exposure`, `description` and the other fields Pi adds.
 *
 * @param previous - Raw entry stored under the server name, if any.
 * @param server - Normalized server being written.
 * @param dialect - Target harness config dialect.
 * @returns {Record<string, unknown>} The raw entry to store.
 */
function replacementEntry(
  previous: unknown,
  server: McpServerConfig,
  dialect: McpConfigFile["dialect"],
): Record<string, unknown> {
  const entry = denormalizeEntry(server, dialect);
  if (dialect !== "pi" || !isObjectRecord(previous)) return entry;
  if (normalizeStandard(server.name, previous).transport !== server.transport) return entry;
  const kept = Object.entries(previous).filter(([key]) => !STANDARD_FIELDS.has(key));
  return { ...entry, ...Object.fromEntries(kept) };
}

function listingBase(entry: McpConfigFile, path: string): McpConfigListing {
  return compact({
    path,
    scope: entry.scope,
    format: entry.format,
    level: entry.level,
    note: entry.note,
    exists: false,
    servers: [],
  });
}

function configServerMap(raw: string, entry: McpConfigFile): Record<string, unknown> {
  const parsed = entry.format === "toml" ? parseToml(raw) : (JSON.parse(raw) as unknown);
  return drill(isObjectRecord(parsed) ? parsed : {}, entry.key) ?? {};
}

function normalizeServerMap(
  map: Readonly<Record<string, unknown>>,
  dialect: McpConfigFile["dialect"],
): McpServerConfig[] {
  const servers: McpServerConfig[] = [];
  for (const [name, rawEntry] of Object.entries(map)) {
    if (isObjectRecord(rawEntry)) servers.push(normalizeEntry(name, rawEntry, dialect));
  }
  return servers;
}

function listMcpConfig(entry: McpConfigFile, path: string): McpConfigListing {
  const base = listingBase(entry, path);
  try {
    if (entry.format === "sqlite") {
      if (!existsSync(path)) return base;
      return { ...base, exists: true, servers: readSqliteServers(path, entry.key) };
    }
    const raw = readIfExists(path);
    if (raw === null) return base;
    const servers = normalizeServerMap(configServerMap(raw, entry), entry.dialect);
    return { ...base, exists: true, servers };
  } catch (error) {
    return {
      ...base,
      exists: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Lists the MCP servers a harness has configured, per declared config file.
 * Missing files come back with `exists: false`; unparsable ones carry `error`.
 *
 * @param harness - Harness whose configs should be read.
 * @param options - Platform and path-resolution overrides.
 * @returns {McpConfigListing[]} One listing per declared config file.
 */
export function listMcpServers(harness: Harness, options: ResolveOptions = {}): McpConfigListing[] {
  return resolveConfigs(harness, options).map(({ entry, path }) => listMcpConfig(entry, path));
}

function writableConfig(
  harness: Harness,
  scope: "user" | "project",
  options: ResolveOptions,
): { entry: McpConfigFile; path: string } {
  const config = resolveConfigs(harness, options).find(({ entry }) => entry.scope === scope);
  if (!config) {
    throw new Error(`Harness ${harness.id} has no ${scope}-scope MCP config`);
  }
  return config;
}

function writeAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${Date.now()}-${process.pid}.mcp.tmp`);
  writeFileSync(temp, content);
  renameSync(temp, path);
}

function tomlValue(value: string): string {
  return JSON.stringify(value);
}

function tomlKeyPart(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

/**
 * Renders one server as TOML sections, scalars before sub-tables.
 *
 * @param key - TOML path containing the server map.
 * @param server - Server to serialize.
 * @param headersKey - Sub-table that holds HTTP headers, `http_headers` for Codex.
 * @returns {string} The rendered TOML section block.
 */
function tomlSections(
  key: readonly string[],
  server: McpServerConfig,
  headersKey: "headers" | "http_headers" = "headers",
): string {
  const head = [...key, server.name].map(tomlKeyPart).join(".");
  const lines = [`[${head}]`];
  if (server.command) lines.push(`command = ${tomlValue(server.command)}`);
  if (server.args?.length) lines.push(`args = [${server.args.map(tomlValue).join(", ")}]`);
  if (server.url) lines.push(`url = ${tomlValue(server.url)}`);
  if (server.enabled !== undefined) lines.push(`enabled = ${server.enabled}`);
  lines.push(
    ...tomlTable(`${head}.env`, server.env),
    ...tomlTable(`${head}.${headersKey}`, server.headers),
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Renders one string map as a TOML sub-table, after a blank line.
 *
 * @param head - Full table name.
 * @param record - Values to write, if any.
 * @returns {string[]} The lines, none for an absent map.
 */
function tomlTable(head: string, record: Readonly<Record<string, string>> | undefined): string[] {
  if (!record) return [];
  return [
    "",
    `[${head}]`,
    ...Object.entries(record).map(([k, v]) => `${tomlKeyPart(k)} = ${tomlValue(v)}`),
  ];
}

/**
 * Deletes the lines that define one server in a TOML config: its
 * `[key.name]` section (with sub-tables) and any `name = {...}` inline
 * assignment inside the bare `[key]` table. Every other line survives
 * byte-for-byte, comments included.
 *
 * @param raw - Original TOML text.
 * @param key - TOML path containing the server map.
 * @param name - Server name to remove.
 * @returns {string} TOML text without the target server.
 */
function stripTomlServer(raw: string, key: readonly string[], name: string): string {
  const prefix = RegExp.escape(key.map(tomlKeyPart).join("."));
  const namePart = `(?:${RegExp.escape(tomlKeyPart(name))}|${RegExp.escape(JSON.stringify(name))})`;
  const sectionRe = new RegExp(`^\\s*\\[${prefix}\\.${namePart}(\\.[^\\]]+)?\\]`);
  const bareTableRe = new RegExp(`^\\s*\\[${prefix}\\]\\s*(#.*)?$`);
  const anyHeaderRe = /^\s*\[/;
  const inlineRe = new RegExp(`^\\s*${namePart}\\s*=`);

  const kept: string[] = [];
  let inTargetSection = false;
  let inBareTable = false;
  for (const line of raw.split("\n")) {
    if (anyHeaderRe.test(line)) {
      inTargetSection = sectionRe.test(line);
      inBareTable = bareTableRe.test(line);
    } else if (inBareTable && inlineRe.test(line)) {
      continue;
    }
    if (inTargetSection) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function serverMapFromToml(raw: string, key: readonly string[]): Record<string, unknown> {
  const parsed = parseToml(raw);
  return drill(parsed as Record<string, unknown>, key) ?? {};
}

/**
 * Verifies a surgical TOML edit before it is written: the result must still
 * parse, hold the expected state for the target server, and leave every other
 * server untouched.
 *
 * @param beforeMap - Server map before the edit.
 * @param after - Candidate TOML text after the edit.
 * @param key - TOML path containing the server map.
 * @param name - Target server name.
 * @param shouldExist - Whether the target must remain after the edit.
 */
function assertTomlEdit(
  beforeMap: Readonly<Record<string, unknown>>,
  after: string,
  key: readonly string[],
  name: string,
  shouldExist: boolean,
): void {
  let afterMap: Record<string, unknown>;
  try {
    afterMap = serverMapFromToml(after, key);
  } catch (error) {
    throw new Error(
      `TOML edit produced an unparsable file, aborting: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (Object.hasOwn(afterMap, name) !== shouldExist) {
    throw new Error(
      `TOML edit did not leave server ${name} ${shouldExist ? "present" : "absent"}, aborting`,
    );
  }

  for (const other of new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])) {
    if (other === name) continue;
    if (JSON.stringify(beforeMap[other]) !== JSON.stringify(afterMap[other])) {
      throw new Error(`TOML edit touched servers other than ${name}, aborting`);
    }
  }
}

function addTomlServer(
  path: string,
  key: readonly string[],
  server: McpServerConfig,
  dialect: McpConfigFile["dialect"],
): boolean {
  const headersKey = dialect === "codex" ? "http_headers" : "headers";
  const before = readIfExists(path) ?? "";
  const beforeMap = serverMapFromToml(before, key);
  const replaced = Object.hasOwn(beforeMap, server.name);
  const stripped = replaced ? stripTomlServer(before, key, server.name) : before;
  const body = stripped.replace(/\s+$/, "");
  const after = body
    ? `${body}\n\n${tomlSections(key, server, headersKey)}`
    : tomlSections(key, server, headersKey);
  assertTomlEdit(beforeMap, after, key, server.name, true);
  writeAtomically(path, after);
  return replaced;
}

function removeTomlServer(path: string, key: readonly string[], name: string): boolean {
  const before = readIfExists(path);
  if (before === null) return false;
  const beforeMap = serverMapFromToml(before, key);
  if (!Object.hasOwn(beforeMap, name)) return false;
  const after = stripTomlServer(before, key, name);
  assertTomlEdit(beforeMap, after, key, name, false);
  writeAtomically(path, after);
  return true;
}

/**
 * Adds (or replaces) one MCP server in a harness's config. The rest of the
 * file is preserved: JSON through a parse/serialize round trip (formatting
 * normalizes to two-space indentation), TOML through a surgical line edit.
 *
 * @param harness - Target harness.
 * @param server - Normalized server configuration to write.
 * @param scope - User or project config scope.
 * @param options - Platform and path-resolution overrides.
 * @returns {{ path: string, replaced: boolean }} The written path and replacement status.
 */
export function addMcpServer(
  harness: Harness,
  server: McpServerConfig,
  scope: "user" | "project" = "user",
  options: ResolveOptions = {},
): { path: string; replaced: boolean } {
  const { entry } = writableConfig(harness, scope, options);
  return writeShapedServer(harness, shapeForDialect(server, entry.dialect), scope, options);
}

/**
 * Writes a server already shaped for the harness dialect. Shaping it again would read a
 * value the first pass took from the environment as a reference of its own.
 *
 * @param harness - Target harness.
 * @param resolved - Server as {@link shapeForDialect} returned it for this harness.
 * @param scope - User or project config scope.
 * @param options - Platform and path-resolution overrides.
 * @returns {{ path: string, replaced: boolean }} The written path and replacement status.
 */
function writeShapedServer(
  harness: Harness,
  resolved: McpServerConfig,
  scope: "user" | "project",
  options: ResolveOptions,
): { path: string; replaced: boolean } {
  const { entry, path } = writableConfig(harness, scope, options);

  if (entry.format === "sqlite") {
    return { path, replaced: upsertSqliteServer(path, entry.key, resolved) };
  }

  if (entry.format === "toml") {
    return { path, replaced: addTomlServer(path, entry.key, resolved, entry.dialect) };
  }

  const root = JSON.parse(readIfExists(path) ?? "{}") as Record<string, unknown>;
  const map = drill(root, entry.key, "create");
  if (!map) throw new Error(`Config at ${path} has a non-object at ${entry.key.join(".")}`);

  const replaced = Object.hasOwn(map, resolved.name);
  map[resolved.name] = replacementEntry(map[resolved.name], resolved, entry.dialect);
  writeAtomically(path, `${JSON.stringify(root, null, 2)}\n`);
  return { path, replaced };
}

/**
 * Removes one MCP server from a harness's config.
 *
 * @param harness - Target harness.
 * @param name - Server name to remove.
 * @param scope - User or project config scope.
 * @param options - Platform and path-resolution overrides.
 * @returns {{ path: string, removed: boolean }} The targeted path and removal status.
 */
export function removeMcpServer(
  harness: Harness,
  name: string,
  scope: "user" | "project" = "user",
  options: ResolveOptions = {},
): { path: string; removed: boolean } {
  const { entry, path } = writableConfig(harness, scope, options);

  if (entry.format === "sqlite") {
    return { path, removed: removeSqliteServer(path, entry.key, name) };
  }

  if (entry.format === "toml") {
    return { path, removed: removeTomlServer(path, entry.key, name) };
  }

  const raw = readIfExists(path);
  if (raw === null) return { path, removed: false };

  const root = JSON.parse(raw) as Record<string, unknown>;
  const map = drill(root, entry.key);
  if (!map || !Object.hasOwn(map, name)) return { path, removed: false };

  delete map[name];
  writeAtomically(path, `${JSON.stringify(root, null, 2)}\n`);
  return { path, removed: true };
}

/**
 * Resolves the master sync file path: $XDG_CONFIG_HOME or ~/.config.
 *
 * @param options - Path-resolution overrides.
 * @returns {string} The resolved master MCP config path.
 */
export function masterMcpPath(options: ResolveOptions = {}): string {
  return join(agntnConfigDir(options), "mcp.jsonc");
}

/** One harness's outcome of a sync run. */
export interface SyncTargetResult {
  id: string;
  path?: string;
  /** Reason this harness could not be targeted; `results` is empty then. */
  skipped?: string;
  /** The global `excludes` names this harness, so its own servers stay. */
  excluded?: true;
  results: Array<{
    name: string;
    action: "added" | "replaced" | "removed" | "kept" | "unchanged" | "skipped";
    /** Why a master server could not be written to this harness. */
    reason?: string;
  }>;
}

/** Outcome of resetting the harness configs to the master list. */
export interface SyncReport {
  source: string;
  servers: string[];
  targets: SyncTargetResult[];
}

function canonical(server: McpServerConfig): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(server).sort(([a], [b]) => a.localeCompare(b))),
  );
}

/**
 * Expands a leading `~` and `${HOME}` in master-list values. Harnesses spawn
 * MCP commands without a shell, so the expansion has to happen here: the
 * synced configs always carry absolute paths.
 *
 * @param value - Master-list value to expand.
 * @param home - Home directory used for expansion.
 * @returns {string} The expanded value.
 */
function expandHome(value: string, home: string): string {
  return value.replaceAll(/^~(?=\/|$)|\$\{HOME\}/g, () => home);
}

function expandServerHome(server: McpServerConfig, home: string): McpServerConfig {
  return compact({
    ...server,
    command: server.command === undefined ? undefined : expandHome(server.command, home),
    args: server.args?.map((arg) => expandHome(arg, home)),
    env: server.env
      ? Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, expandHome(v, home)]))
      : undefined,
  });
}

function requiredMasterServerMap(
  root: Readonly<Record<string, unknown>>,
  path: string,
): Record<string, unknown> {
  const map = drill(root as Record<string, unknown>, ["mcpServers"]);
  if (!map || Array.isArray(map)) {
    throw new Error(`Master MCP list at ${path} has no mcpServers object`);
  }
  return map;
}

function normalizeMasterServers(
  map: Readonly<Record<string, unknown>>,
  home: string,
): McpServerConfig[] {
  const servers: McpServerConfig[] = [];
  for (const [name, rawEntry] of Object.entries(map)) {
    if (isObjectRecord(rawEntry)) {
      servers.push(expandServerHome(normalizeEntry(name, rawEntry, "standard"), home));
    }
  }
  return servers;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function masterExcludes(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!isStringArray(value)) {
    throw new Error(
      `Master MCP list at ${path} has an invalid excludes: expected an array of harness ids`,
    );
  }
  return value;
}

function masterServerExcludes(
  map: Readonly<Record<string, unknown>>,
  path: string,
): Record<string, string[]> {
  const overrides: Array<[string, string[]]> = [];
  for (const [name, rawEntry] of Object.entries(map)) {
    if (!isObjectRecord(rawEntry) || rawEntry.excludes === undefined) continue;
    if (!isStringArray(rawEntry.excludes)) {
      throw new Error(
        `Master MCP list at ${path} has an invalid excludes on ${name}: expected an array of harness ids`,
      );
    }
    overrides.push([name, rawEntry.excludes]);
  }
  return Object.fromEntries(overrides);
}

function masterKeep(value: unknown, path: string): Record<string, string[]> {
  if (value === undefined) return {};
  if (
    !isObjectRecord(value) ||
    Array.isArray(value) ||
    !Object.values(value).every(isStringArray)
  ) {
    throw new Error(
      `Master MCP list at ${path} has an invalid keep: expected harness ids mapped to arrays of server names`,
    );
  }
  return value as Record<string, string[]>;
}

/**
 * Reads and normalizes the master list; throws when the file is missing or invalid.
 *
 * @param options - Path-resolution overrides.
 * @returns {{ path: string, servers: McpServerConfig[], excludes: string[], serverExcludes: Record<string, string[]>, keep: Record<string, string[]> }} The master list.
 */
export function readMasterMcpServers(options: ResolveOptions = {}): {
  path: string;
  servers: McpServerConfig[];
  /** Harness ids the master list opts out of syncing. */
  excludes: string[];
  /** Per server name, its own `excludes`, which replaces the global one for that server. */
  serverExcludes: Record<string, string[]>;
  /** Per harness id, its own server names that sync leaves in place. */
  keep: Record<string, string[]>;
} {
  const path = masterMcpPath(options);
  const raw = readIfExists(path);
  if (raw === null) throw new Error(`No master MCP list at ${path}`);

  const parsed = parseJsonc(raw);
  const root = isObjectRecord(parsed) ? parsed : {};
  const map = requiredMasterServerMap(root, path);
  return {
    path,
    servers: normalizeMasterServers(map, options.homeDir ?? homedir()),
    excludes: masterExcludes(root.excludes, path),
    serverExcludes: masterServerExcludes(map, path),
    keep: masterKeep(root.keep, path),
  };
}

type MasterSyncInput = Readonly<{
  path: string;
  servers: readonly McpServerConfig[];
  excludes: readonly string[];
  serverExcludes: Readonly<Record<string, readonly string[]>>;
  keep: Readonly<Record<string, readonly string[]>>;
}>;

/** What one step of a harness sync changed, and in which file. */
type SyncStep = { path?: string; results: SyncTargetResult["results"] };

function optionalPath(path: string | undefined): {} | { path: string } {
  return path === undefined ? {} : { path };
}

function existingServers(listing: McpConfigListing | undefined): Map<string, string> {
  return new Map((listing?.servers ?? []).map((server) => [server.name, canonical(server)]));
}

/**
 * A server's own `excludes` wins over the global one, `[]` included.
 *
 * @param master - Master list with every exclusion it declares.
 * @param name - Master server name.
 * @param id - Target harness id.
 * @returns {boolean} Whether this server stays out of this harness.
 */
function excludedFrom(master: MasterSyncInput, name: string, id: string): boolean {
  const excludes = Object.hasOwn(master.serverExcludes, name)
    ? master.serverExcludes[name]
    : master.excludes;
  return excludes?.includes(id) === true;
}

function withdrawMasterServers(
  harness: Harness,
  existing: ReadonlyMap<string, string>,
  withdrawn: ReadonlySet<string>,
  options: ResolveOptions,
): SyncStep {
  const results: SyncTargetResult["results"] = [];
  let path: string | undefined;
  for (const name of existing.keys()) {
    if (!withdrawn.has(name)) continue;
    const removed = removeMcpServer(harness, name, "user", options);
    if (removed.removed) {
      path = removed.path;
      results.push({ name, action: "removed" });
    }
  }
  return { ...optionalPath(path), results };
}

/**
 * A server the target dialect cannot hold, skipped in a sync instead of stopping it.
 *
 * @param error - Error thrown while shaping or writing one server.
 * @returns {boolean} Whether the error is one of the refusals a sync reports.
 */
function cannotHold(error: unknown): error is McpEnvError | McpLimitError | McpTransportError {
  return (
    error instanceof McpEnvError ||
    error instanceof McpLimitError ||
    error instanceof McpTransportError
  );
}

function removeExtraServers(
  harness: Harness,
  existing: ReadonlyMap<string, string>,
  masterNames: ReadonlySet<string>,
  keep: Readonly<Record<string, readonly string[]>>,
  options: ResolveOptions,
): SyncStep {
  const kept = (Object.hasOwn(keep, harness.id) ? keep[harness.id] : undefined) ?? [];
  const results: SyncTargetResult["results"] = [];
  let path: string | undefined;
  for (const name of existing.keys()) {
    if (masterNames.has(name)) continue;
    if (kept.includes(name)) {
      results.push({ name, action: "kept" });
      continue;
    }
    const removed = removeMcpServer(harness, name, "user", options);
    if (removed.removed) {
      path = removed.path;
      results.push({ name, action: "removed" });
    }
  }
  return { ...optionalPath(path), results };
}

function writeMasterServers(
  harness: Harness,
  servers: readonly McpServerConfig[],
  existing: ReadonlyMap<string, string>,
  options: ResolveOptions,
): SyncStep {
  const results: SyncTargetResult["results"] = [];
  let path: string | undefined;
  if (servers.length === 0) return { results };
  const { dialect } = writableConfig(harness, "user", options).entry;
  for (const server of servers) {
    try {
      const resolved = shapeForDialect(server, dialect);
      if (existing.get(server.name) === canonical(resolved)) {
        results.push({ name: server.name, action: "unchanged" });
        continue;
      }
      const written = writeShapedServer(harness, resolved, "user", options);
      path = written.path;
      results.push({ name: server.name, action: written.replaced ? "replaced" : "added" });
    } catch (error) {
      // One server the dialect cannot hold must not stop the rest of the list.
      if (!cannotHold(error)) throw error;
      results.push({ name: server.name, action: "skipped", reason: error.message });
    }
  }
  return { ...optionalPath(path), results };
}

/**
 * Writes the servers this harness may have and withdraws the other master names.
 *
 * Removals run first, so a harness with a capped list (OpenBot holds 32) has room for the master
 * servers before they arrive. The report still lists the writes first.
 *
 * @param harness - Target harness with a readable user-scope config.
 * @param master - Master list to sync from.
 * @param existing - Servers the harness config holds now, by name.
 * @param masterNames - Every server name on the master list.
 * @param options - Path-resolution overrides.
 * @returns {SyncStep[]} The outcome of each step, in report order.
 */
function syncMasterServers(
  harness: Harness,
  master: MasterSyncInput,
  existing: ReadonlyMap<string, string>,
  masterNames: ReadonlySet<string>,
  options: ResolveOptions,
): SyncStep[] {
  const allowed = master.servers.filter((server) => !excludedFrom(master, server.name, harness.id));
  const allowedNames = new Set(allowed.map((server) => server.name));
  const withdrawn = new Set([...masterNames].filter((name) => !allowedNames.has(name)));
  const removals = [withdrawMasterServers(harness, existing, withdrawn, options)];
  if (!master.excludes.includes(harness.id)) {
    removals.push(removeExtraServers(harness, existing, masterNames, master.keep, options));
  }
  return [writeMasterServers(harness, allowed, existing, options), ...removals];
}

/**
 * Why a sync can't write to this config, if it can't. A SQLite config that isn't there yet stays
 * that way: only the app may create its database, schema and all.
 *
 * @param listing - The user-scope config as it reads now.
 * @returns {string | undefined} The reason to skip the harness, or undefined.
 */
function unwritableReason(
  listing: Readonly<Pick<McpConfigListing, "error" | "exists" | "format">>,
): string | undefined {
  if (listing.error) return `existing config is unreadable: ${listing.error}`;
  if (listing.format === "sqlite" && !listing.exists) {
    return "no database yet: the app creates it on its first start";
  }
  return undefined;
}

function syncMcpTarget(
  harness: Harness,
  master: MasterSyncInput,
  masterNames: ReadonlySet<string>,
  options: ResolveOptions,
): SyncTargetResult {
  const hasUserConfig = harness.mcpConfigs.some((candidate) => candidate.scope === "user");
  if (!hasUserConfig) {
    return { id: harness.id, skipped: "no user-scope MCP config", results: [] };
  }

  const listing = listMcpServers(harness, options).find((item) => item.scope === "user");
  const skipped = listing && unwritableReason(listing);
  if (listing && skipped) {
    return { id: harness.id, path: listing.path, skipped, results: [] };
  }

  const steps = syncMasterServers(harness, master, existingServers(listing), masterNames, options);
  const path = steps.findLast((step) => step.path !== undefined)?.path ?? listing?.path;
  return {
    id: harness.id,
    ...optionalPath(path),
    ...(master.excludes.includes(harness.id) ? { excluded: true as const } : {}),
    results: steps.flatMap((step) => step.results),
  };
}

/**
 * Resets each harness's user-scope MCP config to exactly the master list:
 * missing servers are added, drifted ones replaced, and servers absent from
 * the master are removed unless its `keep` names them for that harness. A
 * server's own `excludes` replaces the global one for that server. The
 * master file is the single source of truth, exceptions included.
 *
 * @param harnesses - Harnesses to synchronize.
 * @param options - Platform and path-resolution overrides.
 * @returns {SyncReport} Per-harness synchronization outcomes.
 */
export function syncMcpServers(
  harnesses: readonly Harness[],
  options: ResolveOptions = {},
): SyncReport {
  const master = readMasterMcpServers(options);
  const masterNames = new Set(master.servers.map((server) => server.name));
  return {
    source: master.path,
    servers: master.servers.map((server) => server.name),
    targets: harnesses.map((harness) => syncMcpTarget(harness, master, masterNames, options)),
  };
}
