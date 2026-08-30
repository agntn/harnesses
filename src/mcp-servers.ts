/**
 * Normalized MCP server management across harness config dialects.
 *
 * Reads and writes work for every declared config file. JSON writes are a
 * parse/serialize round trip. TOML configs (codex, grok) carry user comments
 * that a round trip would destroy, so TOML writes are surgical line edits:
 * only the target server's section is removed or appended, the result is
 * re-parsed and checked against the intended state before anything is
 * written, and every write lands atomically via a temp file rename.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Harness } from "./harness.ts";
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

/**
 * Reads a file, mapping a missing one to null instead of an error.
 *
 * @param path - File path to read.
 * @returns {string | null} File contents, or null when missing.
 */
function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
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
  if (dialect === "opencode") return normalizeOpenCode(name, raw);
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
  if (dialect === "opencode") return denormalizeOpenCode(server);
  return denormalizeStandard(server);
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

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 * @returns {string} The rendered TOML section block.
 */
function tomlSections(key: readonly string[], server: McpServerConfig): string {
  const head = [...key, server.name].map(tomlKeyPart).join(".");
  const lines = [`[${head}]`];
  if (server.command) lines.push(`command = ${tomlValue(server.command)}`);
  if (server.args?.length) lines.push(`args = [${server.args.map(tomlValue).join(", ")}]`);
  if (server.url) lines.push(`url = ${tomlValue(server.url)}`);
  if (server.enabled !== undefined) lines.push(`enabled = ${server.enabled}`);
  for (const [subKey, record] of [
    ["env", server.env],
    ["headers", server.headers],
  ] as const) {
    if (!record) continue;
    lines.push("", `[${head}.${subKey}]`);
    for (const [k, v] of Object.entries(record)) {
      lines.push(`${tomlKeyPart(k)} = ${tomlValue(v)}`);
    }
  }
  return `${lines.join("\n")}\n`;
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
  const prefix = escapeRegExp(key.map(tomlKeyPart).join("."));
  const namePart = `(?:${escapeRegExp(tomlKeyPart(name))}|${escapeRegExp(JSON.stringify(name))})`;
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

function addTomlServer(path: string, key: readonly string[], server: McpServerConfig): boolean {
  const before = readIfExists(path) ?? "";
  const beforeMap = serverMapFromToml(before, key);
  const replaced = Object.hasOwn(beforeMap, server.name);
  const stripped = replaced ? stripTomlServer(before, key, server.name) : before;
  const body = stripped.replace(/\s+$/, "");
  const after = body ? `${body}\n\n${tomlSections(key, server)}` : tomlSections(key, server);
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
  const { entry, path } = writableConfig(harness, scope, options);

  if (entry.format === "toml") {
    return { path, replaced: addTomlServer(path, entry.key, server) };
  }

  const root = JSON.parse(readIfExists(path) ?? "{}") as Record<string, unknown>;
  const map = drill(root, entry.key, "create");
  if (!map) throw new Error(`Config at ${path} has a non-object at ${entry.key.join(".")}`);

  const replaced = Object.hasOwn(map, server.name);
  map[server.name] = denormalizeEntry(server, entry.dialect);
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

type JsoncState = "code" | "string" | "escape" | "line-comment" | "block-comment";

type JsoncContext = Readonly<{
  text: string;
  index: number;
  character: string;
  next: string | undefined;
}>;

type JsoncStep = Readonly<{
  state: JsoncState;
  output: string;
  advance: number;
}>;

type JsoncScanner = (context: JsoncContext) => JsoncStep;

function trailingJsoncComma(text: string, index: number): boolean {
  const rest = text.slice(index + 1);
  const significant = rest.replaceAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+/g, "");
  return significant.startsWith("}") || significant.startsWith("]");
}

function scanJsoncCode(context: JsoncContext): JsoncStep {
  const { character, next } = context;
  if (character === '"') return { state: "string", output: character, advance: 0 };
  if (character === "/" && next === "/") {
    return { state: "line-comment", output: "", advance: 1 };
  }
  if (character === "/" && next === "*") {
    return { state: "block-comment", output: "", advance: 1 };
  }
  if (character === "," && trailingJsoncComma(context.text, context.index)) {
    return { state: "code", output: "", advance: 0 };
  }
  return { state: "code", output: character, advance: 0 };
}

function scanJsoncString({ character }: JsoncContext): JsoncStep {
  if (character === "\\") return { state: "escape", output: character, advance: 0 };
  if (character === '"') return { state: "code", output: character, advance: 0 };
  return { state: "string", output: character, advance: 0 };
}

function scanJsoncEscape({ character }: JsoncContext): JsoncStep {
  return { state: "string", output: character, advance: 0 };
}

function scanJsoncLineComment({ character }: JsoncContext): JsoncStep {
  if (character === "\n") return { state: "code", output: character, advance: 0 };
  return { state: "line-comment", output: "", advance: 0 };
}

function scanJsoncBlockComment({ character, next }: JsoncContext): JsoncStep {
  if (character === "*" && next === "/") {
    return { state: "code", output: "", advance: 1 };
  }
  return { state: "block-comment", output: "", advance: 0 };
}

const JSONC_SCANNERS: Record<JsoncState, JsoncScanner> = {
  code: scanJsoncCode,
  string: scanJsoncString,
  escape: scanJsoncEscape,
  "line-comment": scanJsoncLineComment,
  "block-comment": scanJsoncBlockComment,
};

/**
 * Strips JSONC extensions (comments and trailing commas) so the master sync
 * file can be read with JSON.parse. String contents are left untouched.
 *
 * @param text - JSONC source text.
 * @returns {unknown} The parsed JSON value.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let state: JsoncState = "code";
  for (let index = 0; index < text.length; index++) {
    const character = text[index] as string;
    const step: JsoncStep = JSONC_SCANNERS[state]({
      text,
      index,
      character,
      next: text[index + 1],
    });
    out += step.output;
    state = step.state;
    index += step.advance;
  }
  return JSON.parse(out);
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
  /** Set when the master list excludes this harness; master-listed names are withdrawn. */
  excluded?: true;
  results: Array<{ name: string; action: "added" | "replaced" | "removed" | "unchanged" }>;
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
  return value.replace(/^~(?=\/|$)/, home).replaceAll("${HOME}", home);
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
  if (!map) throw new Error(`Master MCP list at ${path} has no mcpServers object`);
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

function masterExcludes(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Master MCP list at ${path} has an invalid excludes: expected an array of harness ids`,
    );
  }
  return value as string[];
}

/**
 * Reads and normalizes the master list; throws when the file is missing or invalid.
 *
 * @param options - Path-resolution overrides.
 * @returns {{ path: string, servers: McpServerConfig[], excludes: string[] }} The master list.
 */
export function readMasterMcpServers(options: ResolveOptions = {}): {
  path: string;
  servers: McpServerConfig[];
  /** Harness ids the master list opts out of syncing. */
  excludes: string[];
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
  };
}

type MasterSyncInput = Readonly<{
  path: string;
  servers: readonly McpServerConfig[];
  excludes: readonly string[];
}>;

function optionalPath(path: string | undefined): {} | { path: string } {
  return path === undefined ? {} : { path };
}

function existingServers(listing: McpConfigListing | undefined): Map<string, string> {
  return new Map((listing?.servers ?? []).map((server) => [server.name, canonical(server)]));
}

function withdrawMasterServersFromExcludedHarness(
  harness: Harness,
  existing: ReadonlyMap<string, string>,
  masterNames: ReadonlySet<string>,
  initialPath: string | undefined,
  options: ResolveOptions,
): SyncTargetResult {
  const results: SyncTargetResult["results"] = [];
  let path = initialPath;
  for (const name of existing.keys()) {
    if (!masterNames.has(name)) continue;
    const removed = removeMcpServer(harness, name, "user", options);
    if (removed.removed) {
      path = removed.path;
      results.push({ name, action: "removed" });
    }
  }
  return { id: harness.id, ...optionalPath(path), excluded: true, results };
}

function syncIncludedHarness(
  harness: Harness,
  master: MasterSyncInput,
  existing: ReadonlyMap<string, string>,
  masterNames: ReadonlySet<string>,
  initialPath: string | undefined,
  options: ResolveOptions,
): SyncTargetResult {
  const results: SyncTargetResult["results"] = [];
  let path = initialPath;
  for (const server of master.servers) {
    if (existing.get(server.name) === canonical(server)) {
      results.push({ name: server.name, action: "unchanged" });
      continue;
    }
    const written = addMcpServer(harness, server, "user", options);
    path = written.path;
    results.push({ name: server.name, action: written.replaced ? "replaced" : "added" });
  }
  for (const name of existing.keys()) {
    if (masterNames.has(name)) continue;
    const removed = removeMcpServer(harness, name, "user", options);
    if (removed.removed) {
      path = removed.path;
      results.push({ name, action: "removed" });
    }
  }
  return { id: harness.id, ...optionalPath(path), results };
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
  if (listing?.error) {
    return {
      id: harness.id,
      path: listing.path,
      skipped: `existing config is unreadable: ${listing.error}`,
      results: [],
    };
  }

  const existing = existingServers(listing);
  if (master.excludes.includes(harness.id)) {
    return withdrawMasterServersFromExcludedHarness(
      harness,
      existing,
      masterNames,
      listing?.path,
      options,
    );
  }
  return syncIncludedHarness(harness, master, existing, masterNames, listing?.path, options);
}

/**
 * Resets each harness's user-scope MCP config to exactly the master list:
 * missing servers are added, drifted ones replaced, and servers absent from
 * the master are removed. The master file is the single source of truth.
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
