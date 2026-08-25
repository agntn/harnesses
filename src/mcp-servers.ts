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
import { dirname, isAbsolute, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Harness } from "./harness.ts";
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

/** Reads a file, mapping a missing one to null instead of an error. */
function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function drill(
  root: Record<string, unknown>,
  key: string[],
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

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
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

/** Builds an object with the undefined-valued keys left out. */
function compact<T extends Record<string, unknown>>(source: T): T {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;
}

/** Maps one raw config entry to the normalized shape, per dialect. */
function normalizeEntry(
  name: string,
  raw: Record<string, unknown>,
  dialect: McpConfigFile["dialect"],
): McpServerConfig {
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : undefined;

  if (dialect === "opencode") {
    const command = asStringArray(raw.command);
    const url = typeof raw.url === "string" ? raw.url : undefined;
    return compact({
      name,
      transport: raw.type === "remote" || url ? ("http" as const) : ("stdio" as const),
      command: command?.[0],
      args: command && command.length > 1 ? command.slice(1) : undefined,
      env: asStringRecord(raw.environment),
      url,
      headers: asStringRecord(raw.headers),
      enabled,
    });
  }

  const url =
    typeof raw.httpUrl === "string"
      ? raw.httpUrl
      : typeof raw.url === "string"
        ? raw.url
        : undefined;
  const declared = typeof raw.type === "string" ? raw.type : undefined;

  return compact({
    name,
    transport:
      declared === "sse"
        ? ("sse" as const)
        : declared === "http" || url
          ? ("http" as const)
          : ("stdio" as const),
    command: typeof raw.command === "string" ? raw.command : undefined,
    args: asStringArray(raw.args),
    env: asStringRecord(raw.env),
    url,
    headers: asStringRecord(raw.headers),
    enabled,
  });
}

/** Converts a normalized server back to the raw shape one dialect expects. */
function denormalizeEntry(
  server: McpServerConfig,
  dialect: McpConfigFile["dialect"],
): Record<string, unknown> {
  if (dialect === "opencode") {
    return server.url
      ? compact({
          type: "remote",
          url: server.url,
          headers: server.headers,
          enabled: server.enabled,
        })
      : compact({
          type: "local",
          command: [server.command ?? "", ...(server.args ?? [])],
          environment: server.env,
          enabled: server.enabled,
        });
  }

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
 * Lists the MCP servers a harness has configured, per declared config file.
 * Missing files come back with `exists: false`; unparsable ones carry `error`.
 */
export function listMcpServers(harness: Harness, options: ResolveOptions = {}): McpConfigListing[] {
  return resolveConfigs(harness, options).map(({ entry, path }) => {
    const base: McpConfigListing = compact({
      path,
      scope: entry.scope,
      format: entry.format,
      level: entry.level,
      note: entry.note,
      exists: false,
      servers: [],
    });

    try {
      const raw = readIfExists(path);
      if (raw === null) return base;
      const parsed = entry.format === "toml" ? parseToml(raw) : (JSON.parse(raw) as unknown);
      const map =
        drill(
          (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>,
          entry.key,
        ) ?? {};
      const servers: McpServerConfig[] = [];
      for (const [name, rawEntry] of Object.entries(map)) {
        if (typeof rawEntry === "object" && rawEntry !== null) {
          servers.push(normalizeEntry(name, rawEntry as Record<string, unknown>, entry.dialect));
        }
      }
      return { ...base, exists: true, servers };
    } catch (error) {
      return {
        ...base,
        exists: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
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
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tomlValue(value: string): string {
  return JSON.stringify(value);
}

function tomlKeyPart(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

/** Renders one server as TOML sections, scalars before sub-tables. */
function tomlSections(key: string[], server: McpServerConfig): string {
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
 */
function stripTomlServer(raw: string, key: string[], name: string): string {
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

function serverMapFromToml(raw: string, key: string[]): Record<string, unknown> {
  const parsed = parseToml(raw);
  return drill(parsed as Record<string, unknown>, key) ?? {};
}

/**
 * Verifies a surgical TOML edit before it is written: the result must still
 * parse, hold the expected state for the target server, and leave every other
 * server untouched.
 */
function assertTomlEdit(
  beforeMap: Record<string, unknown>,
  after: string,
  key: string[],
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

function addTomlServer(path: string, key: string[], server: McpServerConfig): boolean {
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

function removeTomlServer(path: string, key: string[], name: string): boolean {
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

/** Removes one MCP server from a harness's config. */
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
