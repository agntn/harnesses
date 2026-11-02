import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import {
  addMcpServer,
  getHarness,
  listMcpServers,
  McpLimitError,
  McpTransportError,
  removeMcpServer,
  syncMcpServers,
} from "../src/index.ts";

/** The table as OpenBot 0.57.0 creates it, copied from its `src/backend/mcp-schema.ts`. */
const OPENBOT_MCP_SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_mcp_servers (
    mcp_server_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport TEXT NOT NULL CHECK(transport IN ('stdio', 'http')),
    enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
    command TEXT NOT NULL,
    args_json TEXT NOT NULL CHECK(json_valid(args_json)),
    env_json TEXT NOT NULL CHECK(json_valid(env_json)),
    env_passthrough_json TEXT NOT NULL CHECK(json_valid(env_passthrough_json)),
    working_directory TEXT NOT NULL,
    url TEXT NOT NULL,
    headers_json TEXT NOT NULL CHECK(json_valid(headers_json)),
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mcp_servers_order ON projection_mcp_servers(position, mcp_server_id);
  CREATE UNIQUE INDEX IF NOT EXISTS mcp_servers_name ON projection_mcp_servers(name);
`;

afterEach(() => {
  vi.unstubAllEnvs();
});

const openbot = getHarness("openbot");

function fixture(): { homeDir: string; platform: "linux"; database: string } {
  const homeDir = mkdtempSync(join(tmpdir(), "harnesses-openbot-mcp-"));
  onTestFinished(() => rmSync(homeDir, { recursive: true, force: true }));
  vi.stubEnv("XDG_CONFIG_HOME", undefined);
  return {
    homeDir,
    platform: "linux",
    database: join(homeDir, ".config", "OpenBot", "openbot.db"),
  };
}

function createDatabase(path: string, schema = OPENBOT_MCP_SCHEMA): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(schema);
  db.close();
}

type Row = { [column: string]: unknown };

function rows(path: string): Row[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db
      .prepare("SELECT * FROM projection_mcp_servers ORDER BY position")
      .all()
      .map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

function insertRow(path: string, row: Readonly<Partial<Record<string, string | number>>>): void {
  const db = new DatabaseSync(path);
  const full = {
    mcp_server_id: `mcp-${String(row.name)}`,
    transport: "stdio",
    enabled: 1,
    command: "node",
    args_json: "[]",
    env_json: "[]",
    env_passthrough_json: "[]",
    working_directory: "",
    url: "",
    headers_json: "[]",
    position: 0,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...row,
  };
  const columns = Object.keys(full);
  db.prepare(
    `INSERT INTO projection_mcp_servers (${columns.join(", ")}) VALUES (${columns.map((c) => `:${c}`).join(", ")})`,
  ).run(full);
  db.close();
}

function writeMaster(homeDir: string, servers: Readonly<Record<string, unknown>>): void {
  const dir = join(homeDir, ".config", "agntn");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mcp.jsonc"), JSON.stringify({ mcpServers: servers }));
}

describe("OpenBot MCP servers in openbot.db", () => {
  it("reads rows in the app's order, with passthrough variables as references", () => {
    const options = fixture();
    createDatabase(options.database);
    insertRow(options.database, {
      name: "remote",
      transport: "http",
      command: "",
      url: "https://example.test/mcp",
      headers_json: JSON.stringify([{ key: "Authorization", value: "Bearer t" }]),
      position: 1,
      enabled: 0,
    });
    insertRow(options.database, {
      name: "local",
      args_json: JSON.stringify(["srv.mjs"]),
      env_json: JSON.stringify([{ key: "MODE", value: "dev" }]),
      env_passthrough_json: JSON.stringify(["API_KEY"]),
      position: 0,
    });

    const [listing] = listMcpServers(openbot, options);
    expect(listing).toMatchObject({ path: options.database, format: "sqlite", exists: true });
    expect(listing?.servers).toEqual([
      {
        name: "local",
        transport: "stdio",
        command: "node",
        args: ["srv.mjs"],
        env: { MODE: "dev", API_KEY: "${API_KEY}" },
        enabled: true,
      },
      {
        name: "remote",
        transport: "http",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer t" },
        enabled: false,
      },
    ]);
  });

  it("adds a row, replaces it in place and removes it", () => {
    const options = fixture();
    createDatabase(options.database);
    insertRow(options.database, { name: "first", position: 4 });

    expect(
      addMcpServer(
        openbot,
        { name: "probe", transport: "stdio", command: "node" },
        "user",
        options,
      ),
    ).toEqual({ path: options.database, replaced: false });
    const added = rows(options.database).find((row) => row.name === "probe");
    expect(added).toMatchObject({ position: 5, enabled: 1, args_json: "[]", url: "" });
    expect(added?.mcp_server_id).toMatch(/^mcp-[0-9a-f-]{36}$/);

    const db = new DatabaseSync(options.database);
    db.prepare(
      "UPDATE projection_mcp_servers SET working_directory = '/srv', env_passthrough_json = '[\"OLD\"]' WHERE name = 'probe'",
    ).run();
    db.close();

    expect(
      addMcpServer(
        openbot,
        { name: "probe", transport: "stdio", command: "npx", env: { TOKEN: "t" } },
        "user",
        options,
      ),
    ).toEqual({ path: options.database, replaced: true });
    expect(rows(options.database).find((row) => row.name === "probe")).toMatchObject({
      mcp_server_id: added?.mcp_server_id,
      position: 5,
      created_at: added?.created_at,
      command: "npx",
      env_json: JSON.stringify([{ key: "TOKEN", value: "t" }]),
      env_passthrough_json: "[]",
      working_directory: "/srv",
    });

    addMcpServer(
      openbot,
      { name: "probe", transport: "http", url: "https://x.test" },
      "user",
      options,
    );
    expect(rows(options.database).find((row) => row.name === "probe")).toMatchObject({
      transport: "http",
      command: "",
      env_json: "[]",
      working_directory: "",
      url: "https://x.test",
    });

    expect(removeMcpServer(openbot, "probe", "user", options)).toEqual({
      path: options.database,
      removed: true,
    });
    expect(removeMcpServer(openbot, "probe", "user", options).removed).toBe(false);
    expect(rows(options.database).map((row) => row.name)).toEqual(["first"]);
  });

  it("never creates the database, and reads a missing one as empty", () => {
    const options = fixture();
    expect(listMcpServers(openbot, options)[0]).toMatchObject({ exists: false, servers: [] });
    expect(() =>
      addMcpServer(
        openbot,
        { name: "probe", transport: "stdio", command: "node" },
        "user",
        options,
      ),
    ).toThrow(/No database at .*openbot\.db yet/);
    expect(removeMcpServer(openbot, "probe", "user", options).removed).toBe(false);
    expect(listMcpServers(openbot, options)[0]?.exists).toBe(false);
  });

  it("reports an OpenBot old enough to have no MCP table instead of throwing", () => {
    const options = fixture();
    createDatabase(options.database, "CREATE TABLE orchestration_events (sequence INTEGER)");
    expect(listMcpServers(openbot, options)[0]?.error).toMatch(/no projection_mcp_servers table/);
  });

  it("refuses what OpenBot cannot hold before touching the table", () => {
    const options = fixture();
    createDatabase(options.database);
    const add =
      (name: string, transport: "stdio" | "sse" = "stdio") =>
      () =>
        addMcpServer(
          openbot,
          { name, transport, command: "node", url: "https://x.test" },
          "user",
          options,
        );

    expect(add("events", "sse")).toThrow(McpTransportError);
    expect(add(" OpenBot_Browser ")).toThrow(McpLimitError);
    expect(add("x".repeat(81))).toThrow(McpLimitError);
    for (let index = 0; index < 32; index++) add(`server-${index}`)();
    expect(add("one-too-many")).toThrow(/holds 32 MCP servers at most/);
    expect(rows(options.database)).toHaveLength(32);
  });
});

describe("syncMcpServers into OpenBot", () => {
  it("resets the table to the master list and is idempotent", () => {
    const options = fixture();
    createDatabase(options.database);
    insertRow(options.database, { name: "@agntn/memory" });
    vi.stubEnv("HARNESSES_TEST_TOKEN", "secret");
    writeMaster(options.homeDir, {
      probe: { command: "~/bin/srv", env: { TOKEN: "${HARNESSES_TEST_TOKEN}" } },
      cloud: { url: "https://example.test/mcp" },
      events: { type: "sse", url: "https://example.test/sse" },
      openbot: { command: "node" },
    });

    const first = syncMcpServers([openbot], options);
    expect(first.targets[0]?.path).toBe(options.database);
    expect(first.targets[0]?.results).toEqual([
      { name: "probe", action: "added" },
      { name: "cloud", action: "added" },
      { name: "events", action: "skipped", reason: expect.stringContaining("not sse") as string },
      {
        name: "openbot",
        action: "skipped",
        reason: expect.stringContaining("keeps this name") as string,
      },
      { name: "@agntn/memory", action: "removed" },
    ]);
    expect(listMcpServers(openbot, options)[0]?.servers).toEqual([
      {
        name: "probe",
        transport: "stdio",
        command: join(options.homeDir, "bin", "srv"),
        env: { TOKEN: "secret" },
        enabled: true,
      },
      { name: "cloud", transport: "http", url: "https://example.test/mcp", enabled: true },
    ]);

    const second = syncMcpServers([openbot], options);
    expect(second.targets[0]?.results.map((result) => result.action)).toEqual([
      "unchanged",
      "unchanged",
      "skipped",
      "skipped",
    ]);
  });

  it("makes room in a full table before it adds the master servers", () => {
    const options = fixture();
    createDatabase(options.database);
    for (let index = 0; index < 32; index++) {
      insertRow(options.database, { name: `old-${index}`, position: index });
    }
    writeMaster(options.homeDir, { probe: { command: "node" } });

    const report = syncMcpServers([openbot], options);
    expect(report.targets[0]?.results[0]).toEqual({ name: "probe", action: "added" });
    expect(rows(options.database).map((row) => row.name)).toEqual(["probe"]);
  });

  it("skips OpenBot until the app has created its database", () => {
    const options = fixture();
    writeMaster(options.homeDir, { probe: { command: "node" } });
    expect(syncMcpServers([openbot], options).targets[0]).toEqual({
      id: "openbot",
      path: options.database,
      skipped: "no database yet: the app creates it on its first start",
      results: [],
    });
  });
});
