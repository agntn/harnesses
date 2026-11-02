/**
 * MCP servers kept as rows of a SQLite table instead of entries in a file.
 *
 * OpenBot is the one harness that does this, so the row layout is its
 * `projection_mcp_servers`. The app writes that table directly, never through
 * its event log, because the rows carry credentials, and so does this module:
 * one short `BEGIN IMMEDIATE` transaction per server, with the busy timeout the
 * app uses itself. A running OpenBot reads the table again for every agent it
 * starts, so a write lands without a restart.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { McpServerConfig } from "./types.ts";

/** How long OpenBot itself waits on a locked database. */
const BUSY_TIMEOUT_MS = 5000;

/** OpenBot's cap: its own reader refuses a longer list, and the settings panel goes blank. */
const MAX_SERVERS = 32;

/** OpenBot's longest name. A row past it is left out of every list the app reads. */
const MAX_NAME_LENGTH = 80;

/** Names OpenBot gives its own servers. A row under one of them never reaches an agent. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(["openbot", "openbot_browser", "computer_use"]);

/** Thrown when a server breaks a limit of the target: a name it keeps, or a full list. */
export class McpLimitError extends Error {
  override readonly name = "McpLimitError";
}

type Row = Readonly<Record<string, unknown>>;

function hasEntries(record: Readonly<Record<string, string>> | undefined): boolean {
  return record !== undefined && Object.keys(record).length > 0;
}

function checkName(name: string): void {
  if (RESERVED_NAMES.has(name.trim().toLowerCase())) {
    throw new McpLimitError(
      `${name}: OpenBot keeps this name for its own server; give it another name`,
    );
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new McpLimitError(`${name}: OpenBot takes names up to ${MAX_NAME_LENGTH} characters`);
  }
}

function httpServer(server: McpServerConfig, enabled: boolean): McpServerConfig {
  const http: McpServerConfig = { name: server.name, transport: "http", enabled };
  if (server.url) http.url = server.url;
  if (hasEntries(server.headers)) http.headers = server.headers;
  return http;
}

function stdioServer(server: McpServerConfig, enabled: boolean): McpServerConfig {
  const stdio: McpServerConfig = { name: server.name, transport: "stdio", enabled };
  if (server.command) stdio.command = server.command;
  if (server.args?.length) stdio.args = server.args;
  if (hasEntries(server.env)) stdio.env = server.env;
  return stdio;
}

/**
 * The server as an OpenBot row holds it. The other transport's fields go, and `enabled` is always
 * set, because every row has one: a master entry without it reads back as `true`.
 *
 * @param server - Normalized stdio or HTTP server with its env references resolved.
 * @returns {McpServerConfig} The server as the table reads back.
 */
export function openBotServer(server: McpServerConfig): McpServerConfig {
  checkName(server.name);
  const enabled = server.enabled ?? true;
  return server.transport === "stdio" ? stdioServer(server, enabled) : httpServer(server, enabled);
}

function jsonColumn(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function stringsColumn(value: unknown): string[] {
  const parsed = jsonColumn(value);
  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
}

/**
 * Reads a column of `{ key, value }` rows, the order the app's form keeps.
 *
 * @param value - Raw JSON text of the column.
 * @returns {Record<string, string>} The pairs as one record.
 */
function pairsColumn(value: unknown): Record<string, string> {
  const parsed = jsonColumn(value);
  if (!Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const pair of parsed as unknown[]) {
    if (typeof pair !== "object" || pair === null) continue;
    const { key, value: text } = pair as Record<string, unknown>;
    if (typeof key === "string" && typeof text === "string") out[key] = text;
  }
  return out;
}

function textColumn(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * One row as a normalized server. A variable the row passes through from OpenBot's own environment
 * reads as a `${NAME}` reference, which is what it is.
 *
 * @param row - One row of the table.
 * @returns {McpServerConfig} The normalized server.
 */
function rowServer(row: Row): McpServerConfig {
  const passthrough = stringsColumn(row.env_passthrough_json).map((name): [string, string] => [
    name,
    `\${${name}}`,
  ]);
  return openBotServer({
    name: String(row.name),
    transport: row.transport === "stdio" ? "stdio" : "http",
    command: textColumn(row.command),
    args: stringsColumn(row.args_json),
    env: { ...pairsColumn(row.env_json), ...Object.fromEntries(passthrough) },
    url: textColumn(row.url),
    headers: pairsColumn(row.headers_json),
    enabled: row.enabled === 1,
  });
}

function pairs(record: Readonly<Record<string, string>> | undefined): string {
  return JSON.stringify(Object.entries(record ?? {}).map(([key, value]) => ({ key, value })));
}

/**
 * Opens the database and checks for the table. An older OpenBot has no such table, and a missing
 * file would be created empty, which is why every caller checks the path first.
 *
 * @param path - Path of the database file, which must exist.
 * @param key - The one table name.
 * @param readOnly - Whether to open the file read-only.
 * @returns {{ db: DatabaseSync, table: string }} The open database and the quoted table name.
 */
function openTable(
  path: string,
  key: readonly string[],
  readOnly: boolean,
): { db: DatabaseSync; table: string } {
  const [name] = key;
  if (name === undefined || key.length !== 1) {
    throw new Error(`A SQLite MCP config names exactly one table, not ${JSON.stringify(key)}`);
  }
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    const found = db
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(name);
    if (!found) throw new Error(`${path} has no ${name} table`);
  } catch (error) {
    db.close();
    throw error;
  }
  return { db, table: `"${name.replaceAll('"', '""')}"` };
}

/**
 * Lists the servers in table order, the order the app shows them in.
 *
 * @param path - Path of the database file, which must exist.
 * @param key - The one table name.
 * @returns {McpServerConfig[]} The normalized servers.
 */
export function readSqliteServers(path: string, key: readonly string[]): McpServerConfig[] {
  const { db, table } = openTable(path, key, true);
  try {
    return db
      .prepare(`SELECT * FROM ${table} ORDER BY position, mcp_server_id`)
      .all()
      .map(rowServer);
  } finally {
    db.close();
  }
}

/**
 * Writes one row inside an open transaction. A replace keeps the id, the place in the list and the
 * working directory of a stdio row, because those are the user's.
 *
 * @param db - Database with a transaction open.
 * @param table - Quoted table name.
 * @param server - Server already shaped by {@link openBotServer}.
 * @returns {boolean} Whether a row with that name was replaced.
 */
/* oxlint-disable-next-line typescript/prefer-readonly-parameter-types */
function writeRow(db: DatabaseSync, table: string, server: McpServerConfig): boolean {
  const values = {
    name: server.name,
    transport: server.transport,
    enabled: server.enabled === false ? 0 : 1,
    command: server.command ?? "",
    args: JSON.stringify(server.args ?? []),
    env: pairs(server.env),
    url: server.url ?? "",
    headers: pairs(server.headers),
    now: new Date().toISOString(),
  };
  const existing = db.prepare(`SELECT mcp_server_id FROM ${table} WHERE name = ?`).get(server.name);
  if (existing) {
    db.prepare(
      `UPDATE ${table} SET transport = :transport, enabled = :enabled, command = :command,
         args_json = :args, env_json = :env, env_passthrough_json = '[]',
         working_directory = CASE WHEN :transport = 'stdio' THEN working_directory ELSE '' END,
         url = :url, headers_json = :headers, updated_at = :now
       WHERE name = :name`,
    ).run(values);
    return true;
  }
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count;
  if (typeof count === "number" && count >= MAX_SERVERS) {
    throw new McpLimitError(`${server.name}: OpenBot holds ${MAX_SERVERS} MCP servers at most`);
  }
  db.prepare(
    `INSERT INTO ${table} (mcp_server_id, name, transport, enabled, command, args_json, env_json,
       env_passthrough_json, working_directory, url, headers_json, position, created_at, updated_at)
     VALUES (:id, :name, :transport, :enabled, :command, :args, :env, '[]', '', :url, :headers,
       (SELECT COALESCE(MAX(position) + 1, 0) FROM ${table}), :now, :now)`,
  ).run({ ...values, id: `mcp-${randomUUID()}` });
  return false;
}

/**
 * Adds or replaces one server by name. A failed write rolls back only when SQLite hasn't already,
 * since a second ROLLBACK would hide the first error.
 *
 * @param path - Path of the database file.
 * @param key - The one table name.
 * @param server - Server already shaped by {@link openBotServer}.
 * @returns {boolean} Whether a row with that name was replaced.
 */
export function upsertSqliteServer(
  path: string,
  key: readonly string[],
  server: McpServerConfig,
): boolean {
  if (!existsSync(path)) {
    throw new Error(`No database at ${path} yet: the app creates it on its first start`);
  }
  const { db, table } = openTable(path, key, false);
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const replaced = writeRow(db, table, server);
      db.exec("COMMIT");
      return replaced;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

/**
 * Removes one server by name. A missing database holds nothing to remove.
 *
 * @param path - Path of the database file.
 * @param key - The one table name.
 * @param name - Server name to remove.
 * @returns {boolean} Whether a row was removed.
 */
export function removeSqliteServer(path: string, key: readonly string[], name: string): boolean {
  if (!existsSync(path)) return false;
  const { db, table } = openTable(path, key, false);
  try {
    return Number(db.prepare(`DELETE FROM ${table} WHERE name = ?`).run(name).changes) > 0;
  } finally {
    db.close();
  }
}
