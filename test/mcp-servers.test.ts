import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMcpServer,
  getHarness,
  listMcpServers,
  McpEnvError,
  registerHarness,
  removeMcpServer,
  syncMcpServers,
  type SyncTargetResult,
} from "../src/index.ts";
import Cursor from "../src/harnesses/cursor.ts";
import { mcpList } from "../src/tool-operations.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

let mcpListFixturePath = "";

class McpListFixtureHarness extends Cursor {
  override readonly mcpConfigs = [
    {
      path: mcpListFixturePath,
      scope: "project" as const,
      level: "official" as const,
      format: "json" as const,
      key: ["mcpServers"],
      dialect: "standard" as const,
    },
  ];
}

function fixtureDirs(): { homeDir: string; projectRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "harnesses-mcp-"));
  const homeDir = join(root, "home");
  const projectRoot = join(root, "project");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  return { homeDir, projectRoot };
}

function withMcpListFixture(run: () => void): void {
  const dirs = fixtureDirs();
  mcpListFixturePath = join(dirs.projectRoot, ".mcp.json");

  try {
    registerHarness(McpListFixtureHarness);
    run();
  } finally {
    registerHarness(Cursor);
    mcpListFixturePath = "";
    rmSync(dirname(dirs.projectRoot), { recursive: true, force: true });
  }
}

function parseJsonRecord(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`Expected a JSON object at ${path}`);
  }
  return parsed as Record<string, unknown>;
}

function nestedRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected ${key} to be an object`);
  }
  return value as Record<string, unknown>;
}

describe("listMcpServers", () => {
  it("normalizes the standard JSON dialect", () => {
    const dirs = fixtureDirs();
    writeFileSync(
      join(dirs.homeDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          wiki: { type: "stdio", command: "node", args: ["cli.mjs", "mcp"], env: { A: "1" } },
          cloud: { type: "http", url: "https://example.com/mcp" },
        },
      }),
    );

    const listings = listMcpServers(getHarness("claude"), dirs);
    const user = listings.find((l) => l.scope === "user");

    expect(user?.exists).toBe(true);
    expect(user?.servers).toEqual([
      {
        name: "wiki",
        transport: "stdio",
        command: "node",
        args: ["cli.mjs", "mcp"],
        env: { A: "1" },
      },
      { name: "cloud", transport: "http", url: "https://example.com/mcp" },
    ]);
    expect(listings.find((l) => l.scope === "project")?.exists).toBe(false);
  });

  it("reads Prime Agent env references as ${NAME} values", () => {
    const dirs = fixtureDirs();
    const settings = join(dirs.homeDir, ".prime", "agent", "settings.json");
    mkdirSync(dirname(settings), { recursive: true });
    writeFileSync(
      settings,
      JSON.stringify({
        theme: "dark",
        mcpServers: {
          local: {
            type: "stdio",
            command: "node",
            args: ["server.js", "--stdio"],
            env: { TOKEN: { env: "EXAMPLE_TOKEN" } },
          },
          proxy: { type: "http", url: "https://proxy.example.com/mcp", bearerTokenEnvVar: "T" },
        },
      }),
    );

    const [user] = listMcpServers(getHarness("prime-agent"), dirs);
    expect(user?.servers).toEqual([
      {
        name: "local",
        transport: "stdio",
        command: "node",
        args: ["server.js", "--stdio"],
        env: { TOKEN: "${EXAMPLE_TOKEN}" },
      },
      { name: "proxy", transport: "http", url: "https://proxy.example.com/mcp" },
    ]);

    addMcpServer(
      getHarness("prime-agent"),
      { name: "extra", transport: "stdio", command: "wiki", env: { WIKI_ROOT: "${WIKI_ROOT}" } },
      "user",
      dirs,
    );

    const raw = parseJsonRecord(settings);
    expect(raw.theme).toBe("dark");
    expect(nestedRecord(nestedRecord(raw, "mcpServers"), "proxy").bearerTokenEnvVar).toBe("T");
    expect(nestedRecord(nestedRecord(raw, "mcpServers"), "extra")).toEqual({
      type: "stdio",
      command: "wiki",
      env: { WIKI_ROOT: { env: "WIKI_ROOT" } },
    });
    expect(Object.keys(nestedRecord(raw, "mcpServers")).sort()).toEqual([
      "extra",
      "local",
      "proxy",
    ]);
  });

  it("refuses a literal env value for Prime Agent instead of writing a broken server", () => {
    const dirs = fixtureDirs();
    const settings = join(dirs.homeDir, ".prime", "agent", "settings.json");

    expect(() =>
      addMcpServer(
        getHarness("prime-agent"),
        { name: "wiki", transport: "stdio", command: "wiki", env: { WIKI_ROOT: "/srv/wiki" } },
        "user",
        dirs,
      ),
    ).toThrow(McpEnvError);
    expect(existsSync(settings)).toBe(false);
  });

  it("resolves ${NAME} env references for dialects without native ones", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HARNESSES_TEST_TOKEN", "from-env");

    addMcpServer(
      getHarness("claude"),
      {
        name: "probe",
        transport: "stdio",
        command: "node",
        env: { TOKEN: "${HARNESSES_TEST_TOKEN}" },
      },
      "user",
      dirs,
    );
    const probe = nestedRecord(
      nestedRecord(parseJsonRecord(join(dirs.homeDir, ".claude.json")), "mcpServers"),
      "probe",
    );
    expect(probe.env).toEqual({ TOKEN: "from-env" });

    for (const missing of ["HARNESSES_UNSET_VAR", "constructor", "__proto__"]) {
      expect(() =>
        addMcpServer(
          getHarness("claude"),
          { name: "probe", transport: "stdio", command: "node", env: { TOKEN: `\${${missing}}` } },
          "user",
          dirs,
        ),
      ).toThrow(McpEnvError);
    }
  });

  it("reads Mastra Code mcp.json at both scopes and by keys, not type", () => {
    const dirs = fixtureDirs();
    const userDir = join(dirs.homeDir, ".mastracode");
    const projectDir = join(dirs.projectRoot, ".mastracode");
    mkdirSync(userDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(userDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          registries: { type: "sse", command: "node", args: ["cli.mjs", "mcp"], env: { A: "1" } },
          remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer x" } },
        },
      }),
    );
    writeFileSync(
      join(projectDir, "mcp.json"),
      JSON.stringify({ mcpServers: { registries: { command: "pnpm", args: ["mcp"] } } }),
    );
    writeFileSync(
      join(dirs.projectRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { shared: { type: "stdio", command: "npx", args: ["srv"] } } }),
    );

    const listings = listMcpServers(getHarness("mastracode"), dirs);

    expect(listings.map((l) => [l.scope, l.path])).toEqual([
      ["user", join(userDir, "mcp.json")],
      ["project", join(projectDir, "mcp.json")],
      ["project", join(dirs.projectRoot, ".mcp.json")],
    ]);
    expect(listings[0]?.servers).toEqual([
      {
        name: "registries",
        transport: "stdio",
        command: "node",
        args: ["cli.mjs", "mcp"],
        env: { A: "1" },
      },
      {
        name: "remote",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer x" },
      },
    ]);
    expect(listings[1]?.servers).toEqual([
      { name: "registries", transport: "stdio", command: "pnpm", args: ["mcp"] },
    ]);
    expect(listings[2]?.servers).toEqual([
      { name: "shared", transport: "stdio", command: "npx", args: ["srv"] },
    ]);
  });

  it("normalizes the Antigravity serverUrl dialect", () => {
    const dirs = fixtureDirs();
    const configDir = join(dirs.homeDir, ".gemini", "config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "mcp_config.json"),
      JSON.stringify({
        mcpServers: {
          local: { command: "node", args: ["srv.mjs"], env: { K: "v" } },
          remote: { serverUrl: "https://example.com/sse" },
        },
      }),
    );

    const [listing] = listMcpServers(getHarness("antigravity"), dirs);

    expect(listing?.servers).toEqual([
      { name: "local", transport: "stdio", command: "node", args: ["srv.mjs"], env: { K: "v" } },
      { name: "remote", transport: "sse", url: "https://example.com/sse" },
    ]);
  });

  it("reads the TOML dialect of grok configs", () => {
    const dirs = fixtureDirs();
    mkdirSync(join(dirs.homeDir, ".grok"), { recursive: true });
    writeFileSync(
      join(dirs.homeDir, ".grok", "config.toml"),
      '[mcp_servers.files]\ncommand = "npx"\nargs = ["-y", "server-files"]\n',
    );

    const listings = listMcpServers(getHarness("grok"), dirs);
    const user = listings.find((l) => l.scope === "user");

    expect(user?.servers).toEqual([
      { name: "files", transport: "stdio", command: "npx", args: ["-y", "server-files"] },
    ]);
  });

  it("normalizes the opencode dialect", () => {
    const dirs = fixtureDirs();
    writeFileSync(
      join(dirs.projectRoot, "opencode.json"),
      JSON.stringify({
        mcp: {
          local: { type: "local", command: ["bun", "x", "srv"], environment: { K: "v" } },
          remote: { type: "remote", url: "https://example.com/mcp", enabled: false },
        },
      }),
    );

    const project = listMcpServers(getHarness("opencode"), dirs).find((l) => l.scope === "project");

    expect(project?.servers).toEqual([
      { name: "local", transport: "stdio", command: "bun", args: ["x", "srv"], env: { K: "v" } },
      { name: "remote", transport: "http", url: "https://example.com/mcp", enabled: false },
    ]);
  });

  it("reports a parse failure without throwing", () => {
    const dirs = fixtureDirs();
    writeFileSync(join(dirs.homeDir, ".claude.json"), "{broken");

    const user = listMcpServers(getHarness("claude"), dirs).find((l) => l.scope === "user");

    expect(user?.exists).toBe(true);
    expect(user?.error).toBeTruthy();
    expect(user?.servers).toEqual([]);
  });
});

describe("mcpList", () => {
  it("redacts credentials at the tool boundary without changing config reads", () => {
    withMcpListFixture(() => {
      const secret = "issue-1-secret-sentinel";
      writeFileSync(
        mcpListFixturePath,
        JSON.stringify({
          mcpServers: {
            probe: {
              command: "node",
              env: { API_TOKEN: secret },
              headers: { Authorization: `Bearer ${secret}` },
            },
          },
        }),
      );

      const raw = listMcpServers(getHarness("cursor"));
      expect(raw[0]?.servers[0]).toMatchObject({
        env: { API_TOKEN: secret },
        headers: { Authorization: `Bearer ${secret}` },
      });

      const result = mcpList("cursor");
      if (!("harnesses" in result.details)) throw new Error("Expected an MCP listing");
      expect(result.details.harnesses[0]?.configs[0]?.servers[0]).toMatchObject({
        env: { API_TOKEN: "<redacted>" },
        headers: { Authorization: "<redacted>" },
      });
      expect(result.content[0]?.text).not.toContain(secret);
    });
  });

  it("does not echo malformed config contents", () => {
    withMcpListFixture(() => {
      const secret = "LEAKME";
      writeFileSync(
        mcpListFixturePath,
        `{"mcpServers":{"probe":{"headers":{"Authorization":${secret}}}}`,
      );

      const result = mcpList("cursor");
      if (!("harnesses" in result.details)) throw new Error("Expected an MCP listing");
      expect(result.details.harnesses[0]?.configs[0]?.error).toBe(
        "Unable to read or parse MCP config",
      );
      expect(result.content[0]?.text).not.toContain(secret);
    });
  });
});

describe("addMcpServer / removeMcpServer", () => {
  it("adds, replaces, and removes a server in a JSON config", () => {
    const dirs = fixtureDirs();
    const claude = getHarness("claude");
    const server = {
      name: "probe",
      transport: "stdio" as const,
      command: "node",
      args: ["srv.mjs"],
    };

    const added = addMcpServer(claude, server, "project", dirs);
    expect(added.replaced).toBe(false);
    expect(added.path).toBe(join(dirs.projectRoot, ".mcp.json"));

    const replaced = addMcpServer(claude, { ...server, args: ["srv2.mjs"] }, "project", dirs);
    expect(replaced.replaced).toBe(true);

    const listed = listMcpServers(claude, dirs).find((l) => l.scope === "project");
    expect(listed?.servers).toEqual([
      { name: "probe", transport: "stdio", command: "node", args: ["srv2.mjs"] },
    ]);

    const removed = removeMcpServer(claude, "probe", "project", dirs);
    expect(removed.removed).toBe(true);
    expect(removeMcpServer(claude, "probe", "project", dirs).removed).toBe(false);
  });

  it("preserves unrelated keys in the config file", () => {
    const dirs = fixtureDirs();
    writeFileSync(
      join(dirs.homeDir, ".claude.json"),
      JSON.stringify({ theme: "dark", mcpServers: { keep: { command: "x" } } }),
    );

    addMcpServer(
      getHarness("claude"),
      { name: "extra", transport: "http", url: "https://example.com" },
      "user",
      dirs,
    );

    const raw = parseJsonRecord(join(dirs.homeDir, ".claude.json"));
    expect(raw.theme).toBe("dark");
    expect(Object.keys(nestedRecord(raw, "mcpServers")).sort()).toEqual(["extra", "keep"]);
  });

  it("writes the Antigravity serverUrl dialect shape", () => {
    const dirs = fixtureDirs();

    addMcpServer(
      getHarness("antigravity"),
      { name: "remote", transport: "sse", url: "https://example.com/sse" },
      "user",
      dirs,
    );

    const path = join(dirs.homeDir, ".gemini", "config", "mcp_config.json");
    const raw = parseJsonRecord(path);
    expect(nestedRecord(raw, "mcpServers").remote).toEqual({
      serverUrl: "https://example.com/sse",
    });
  });

  it("writes the opencode dialect shape", () => {
    const dirs = fixtureDirs();

    addMcpServer(
      getHarness("opencode"),
      { name: "srv", transport: "stdio", command: "bun", args: ["x", "srv"], env: { K: "v" } },
      "project",
      dirs,
    );

    const raw = parseJsonRecord(join(dirs.projectRoot, "opencode.json"));
    expect(nestedRecord(raw, "mcp").srv).toEqual({
      type: "local",
      command: ["bun", "x", "srv"],
      environment: { K: "v" },
    });
  });

  it("writes the Mastra Code shape without a type field", () => {
    const dirs = fixtureDirs();
    const mastracode = getHarness("mastracode");

    addMcpServer(
      mastracode,
      { name: "events", transport: "sse", url: "https://example.com/sse", enabled: true },
      "project",
      dirs,
    );
    addMcpServer(
      mastracode,
      { name: "local", transport: "stdio", command: "node", args: ["srv.mjs"], env: { K: "v" } },
      "project",
      dirs,
    );

    const raw = nestedRecord(
      parseJsonRecord(join(dirs.projectRoot, ".mastracode", "mcp.json")),
      "mcpServers",
    );
    expect(raw.events).toEqual({ url: "https://example.com/sse" });
    expect(raw.local).toEqual({ command: "node", args: ["srv.mjs"], env: { K: "v" } });
    expect(listMcpServers(mastracode, dirs)[1]?.servers.map((s) => s.transport)).toEqual([
      "http",
      "stdio",
    ]);
  });

  it("adds and removes a TOML server while preserving comments byte-for-byte", () => {
    const dirs = fixtureDirs();
    const grok = getHarness("grok");
    const original =
      '# my grok config\n[ui]\ntheme = "auto" # keep\n\n[mcp_servers.keep]\ncommand = "npx"\nargs = ["-y", "srv"]\n';
    mkdirSync(join(dirs.homeDir, ".grok"), { recursive: true });
    const configPath = join(dirs.homeDir, ".grok", "config.toml");
    writeFileSync(configPath, original);

    const added = addMcpServer(
      grok,
      { name: "probe", transport: "stdio", command: "node", args: ["srv.mjs"], env: { K: "v" } },
      "user",
      dirs,
    );
    expect(added.replaced).toBe(false);

    const afterAdd = readFileSync(configPath, "utf8");
    expect(afterAdd.startsWith(original)).toBe(true);
    expect(afterAdd).toContain("[mcp_servers.probe]");
    expect(afterAdd).toContain("[mcp_servers.probe.env]");

    const servers = listMcpServers(grok, dirs).find((l) => l.scope === "user")?.servers;
    expect(servers).toContainEqual({
      name: "probe",
      transport: "stdio",
      command: "node",
      args: ["srv.mjs"],
      env: { K: "v" },
    });

    const replaced = addMcpServer(
      grok,
      { name: "probe", transport: "http", url: "https://example.com/mcp" },
      "user",
      dirs,
    );
    expect(replaced.replaced).toBe(true);

    const removed = removeMcpServer(grok, "probe", "user", dirs);
    expect(removed.removed).toBe(true);
    const final = readFileSync(configPath, "utf8");
    expect(final).toContain("# my grok config");
    expect(final).toContain('theme = "auto" # keep');
    expect(final).toContain("[mcp_servers.keep]");
    expect(final).not.toContain("probe");
    expect(removeMcpServer(grok, "probe", "user", dirs).removed).toBe(false);
  });

  it("creates a fresh TOML config for codex when none exists", () => {
    const dirs = fixtureDirs();

    const added = addMcpServer(
      getHarness("codex"),
      { name: "files", transport: "stdio", command: "npx", args: ["-y", "server-files"] },
      "user",
      dirs,
    );
    expect(added.replaced).toBe(false);

    const servers = listMcpServers(getHarness("codex"), dirs).find(
      (l) => l.scope === "user",
    )?.servers;
    expect(servers).toEqual([
      { name: "files", transport: "stdio", command: "npx", args: ["-y", "server-files"] },
    ]);
  });

  it("refuses a scope the harness does not declare", () => {
    const dirs = fixtureDirs();

    expect(() =>
      addMcpServer(
        getHarness("github-copilot"),
        { name: "x", transport: "stdio", command: "y" },
        "user",
        dirs,
      ),
    ).toThrow(/no user-scope MCP config/);
  });
});

describe("syncMcpServers", () => {
  type SyncRow = Readonly<SyncTargetResult["results"][number]>;

  function targetResults(
    targets: ReadonlyArray<Readonly<{ id: string; results: readonly SyncRow[] }>>,
    id: string,
  ): readonly SyncRow[] {
    const target = targets.find((t) => t.id === id);
    if (!target) throw new Error(`Missing sync target: ${id}`);
    return target.results;
  }

  function writeMaster(homeDir: string, body: string): string {
    const dir = join(homeDir, ".config", "agntn");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "mcp.jsonc");
    writeFileSync(path, body);
    return path;
  }

  const master = `{
  // shared servers for every harness
  "mcpServers": {
    "probe": {
      "command": "node",
      "args": ["srv.mjs"], // trailing comma below is fine
    },
    "cloud": { "url": "https://example.com/mcp" },
  },
}`;

  it("resets JSON and TOML configs to the master list and is idempotent", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(dirs.homeDir, master);
      mkdirSync(join(dirs.homeDir, ".grok"), { recursive: true });
      writeFileSync(
        join(dirs.homeDir, ".grok", "config.toml"),
        '# grok config\n[mcp_servers.keep]\ncommand = "npx"\n',
      );

      const first = syncMcpServers([getHarness("claude"), getHarness("grok")], dirs);
      expect(first.servers).toEqual(["probe", "cloud"]);
      expect(first.targets.find((t) => t.id === "claude")?.results.map((r) => r.action)).toEqual([
        "added",
        "added",
      ]);
      expect(first.targets.find((t) => t.id === "grok")?.results).toEqual([
        { name: "probe", action: "added" },
        { name: "cloud", action: "added" },
        { name: "keep", action: "removed" },
      ]);

      const grokConfig = readFileSync(join(dirs.homeDir, ".grok", "config.toml"), "utf8");
      expect(grokConfig).toContain("# grok config");
      const grokServers = listMcpServers(getHarness("grok"), dirs).find(
        (l) => l.scope === "user",
      )?.servers;
      expect(grokServers?.map((s) => s.name).sort()).toEqual(["cloud", "probe"]);

      const second = syncMcpServers([getHarness("claude"), getHarness("grok")], dirs);
      for (const target of second.targets) {
        expect(target.results.map((r) => r.action)).toEqual(["unchanged", "unchanged"]);
      }
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("writes env references natively for Prime Agent and skips what a dialect cannot hold", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    vi.stubEnv("HARNESSES_TEST_NAMESPACE", "team");
    try {
      writeMaster(
        dirs.homeDir,
        `{
  "mcpServers": {
    "plain": { "command": "node", "args": ["srv.mjs"] },
    "memory": { "command": "memory", "env": { "NAMESPACE": "\${HARNESSES_TEST_NAMESPACE}" } },
    "wiki": { "command": "wiki", "env": { "WIKI_ROOT": "/srv/wiki" } },
    "unset": { "command": "x", "env": { "KEY": "\${HARNESSES_UNSET_VAR}" } },
  },
}`,
      );

      const targets = [getHarness("prime-agent"), getHarness("claude")];
      const first = syncMcpServers(targets, dirs);
      const prime = targetResults(first.targets, "prime-agent");
      const claude = targetResults(first.targets, "claude");

      expect(prime.map((r) => [r.name, r.action])).toEqual([
        ["plain", "added"],
        ["memory", "added"],
        ["wiki", "skipped"],
        ["unset", "added"],
      ]);
      expect(prime[2]?.reason).toContain("environment references");
      expect(claude.map((r) => [r.name, r.action])).toEqual([
        ["plain", "added"],
        ["memory", "added"],
        ["wiki", "added"],
        ["unset", "skipped"],
      ]);
      expect(claude[3]?.reason).toContain("HARNESSES_UNSET_VAR");

      const primeRaw = nestedRecord(
        parseJsonRecord(join(dirs.homeDir, ".prime", "agent", "settings.json")),
        "mcpServers",
      );
      expect(nestedRecord(primeRaw, "memory").env).toEqual({
        NAMESPACE: { env: "HARNESSES_TEST_NAMESPACE" },
      });
      expect(nestedRecord(primeRaw, "unset").env).toEqual({ KEY: { env: "HARNESSES_UNSET_VAR" } });
      expect(primeRaw.wiki).toBeUndefined();
      const claudeRaw = nestedRecord(
        parseJsonRecord(join(dirs.homeDir, ".claude.json")),
        "mcpServers",
      );
      expect(nestedRecord(claudeRaw, "memory").env).toEqual({ NAMESPACE: "team" });
      expect(nestedRecord(claudeRaw, "wiki").env).toEqual({ WIKI_ROOT: "/srv/wiki" });
      expect(claudeRaw.unset).toBeUndefined();

      const second = syncMcpServers(targets, dirs);
      expect(targetResults(second.targets, "prime-agent").map((r) => r.action)).toEqual([
        "unchanged",
        "unchanged",
        "skipped",
        "unchanged",
      ]);
      expect(targetResults(second.targets, "claude").map((r) => r.action)).toEqual([
        "unchanged",
        "unchanged",
        "unchanged",
        "skipped",
      ]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("syncs an sse master entry with enabled into Mastra Code once", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        JSON.stringify({
          mcpServers: { events: { type: "sse", url: "https://example.com/sse", enabled: false } },
        }),
      );

      const first = syncMcpServers([getHarness("mastracode")], dirs);
      expect(targetResults(first.targets, "mastracode")).toEqual([
        { name: "events", action: "added" },
      ]);
      const raw = parseJsonRecord(join(dirs.homeDir, ".mastracode", "mcp.json"));
      expect(nestedRecord(raw, "mcpServers").events).toEqual({ url: "https://example.com/sse" });

      const second = syncMcpServers([getHarness("mastracode")], dirs);
      expect(targetResults(second.targets, "mastracode")).toEqual([
        { name: "events", action: "unchanged" },
      ]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("reports a literal Prime Agent env as skipped even when the file already holds it", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        `{ "mcpServers": { "wiki": { "command": "wiki", "env": { "WIKI_ROOT": "/srv/wiki" } } } }`,
      );
      const settings = join(dirs.homeDir, ".prime", "agent", "settings.json");
      mkdirSync(dirname(settings), { recursive: true });
      const broken = {
        mcpServers: { wiki: { type: "stdio", command: "wiki", env: { WIKI_ROOT: "/srv/wiki" } } },
      };
      writeFileSync(settings, JSON.stringify(broken));

      const report = syncMcpServers([getHarness("prime-agent")], dirs);
      expect(report.targets[0]?.results).toEqual([
        { name: "wiki", action: "skipped", reason: expect.stringContaining("WIKI_ROOT") as string },
      ]);
      expect(parseJsonRecord(settings)).toEqual(broken);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("replaces a drifted server and skips harnesses without a user config", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(dirs.homeDir, master);
      writeFileSync(
        join(dirs.homeDir, ".claude.json"),
        JSON.stringify({ mcpServers: { probe: { type: "stdio", command: "old" } } }),
      );

      const report = syncMcpServers(
        [getHarness("claude"), getHarness("github-copilot"), getHarness("pi")],
        dirs,
      );

      const claude = report.targets.find((t) => t.id === "claude");
      expect(claude?.results).toEqual([
        { name: "probe", action: "replaced" },
        { name: "cloud", action: "added" },
      ]);
      expect(report.targets.find((t) => t.id === "github-copilot")?.skipped).toContain(
        "no user-scope",
      );
      expect(report.targets.find((t) => t.id === "pi")?.skipped).toContain("no user-scope");
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("skips harnesses excluded by the master list", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        `{
  // codex keeps its own MCP setup
  "excludes": ["codex"],
  "mcpServers": { "probe": { "command": "node" } },
}`,
      );

      const report = syncMcpServers([getHarness("claude"), getHarness("codex")], dirs);

      const codex = report.targets.find((t) => t.id === "codex");
      expect(codex?.excluded).toBe(true);
      expect(codex?.results).toEqual([]);
      expect(report.targets.find((t) => t.id === "claude")?.results).toEqual([
        { name: "probe", action: "added" },
      ]);
      const codexServers = listMcpServers(getHarness("codex"), dirs).find(
        (l) => l.scope === "user",
      );
      expect(codexServers?.exists).toBe(false);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("expands ~ and ${HOME} from the master list into absolute paths", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        JSON.stringify({
          mcpServers: {
            probe: {
              command: "node",
              args: ["~/proj/cli.mjs", "mcp"],
              env: { ROOT: "${HOME}/data" },
            },
          },
        }),
      );

      syncMcpServers([getHarness("claude")], dirs);

      const server = listMcpServers(getHarness("claude"), dirs)
        .find((l) => l.scope === "user")
        ?.servers.find((s) => s.name === "probe");
      expect(server?.args).toEqual([join(dirs.homeDir, "proj", "cli.mjs"), "mcp"]);
      expect(server?.env).toEqual({ ROOT: join(dirs.homeDir, "data") });
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("expands ~ and ${HOME} verbatim when the home path holds replacement tokens", () => {
    const homeDir = join(fixtureDirs().homeDir, "$$ $& $` $' $1 ${HOME}");
    const projectRoot = join(homeDir, "project");
    mkdirSync(projectRoot, { recursive: true });
    const dirs = { homeDir, projectRoot };
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        homeDir,
        JSON.stringify({
          mcpServers: {
            probe: { command: "~/bin/probe", args: ["${HOME}/data"] },
          },
        }),
      );

      syncMcpServers([getHarness("claude")], dirs);

      const server = listMcpServers(getHarness("claude"), dirs)
        .find((l) => l.scope === "user")
        ?.servers.find((s) => s.name === "probe");
      expect(server?.command).toBe(join(homeDir, "bin", "probe"));
      expect(server?.args).toEqual([join(homeDir, "data")]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("withdraws master-owned servers when a harness is excluded after a sync", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      const masterBody = (excludes: readonly string[]) =>
        JSON.stringify({
          excludes,
          mcpServers: { probe: { command: "node" }, cloud: { url: "https://example.com/mcp" } },
        });
      writeMaster(dirs.homeDir, masterBody([]));
      syncMcpServers([getHarness("claude")], dirs);

      addMcpServer(
        getHarness("claude"),
        { name: "mine", transport: "stdio", command: "own-server" },
        "user",
        dirs,
      );
      writeMaster(dirs.homeDir, masterBody(["claude"]));
      const report = syncMcpServers([getHarness("claude")], dirs);

      const claude = report.targets.find((t) => t.id === "claude");
      expect(claude?.excluded).toBe(true);
      expect(claude?.results.map((r) => r.name).sort()).toEqual(["cloud", "probe"]);
      expect(claude?.results.every((r) => r.action === "removed")).toBe(true);

      const servers = listMcpServers(getHarness("claude"), dirs).find(
        (l) => l.scope === "user",
      )?.servers;
      expect(servers?.map((s) => s.name)).toEqual(["mine"]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("rejects an excludes field that is not an array of strings", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(dirs.homeDir, JSON.stringify({ excludes: "codex", mcpServers: {} }));

      expect(() => syncMcpServers([getHarness("claude")], dirs)).toThrow(/invalid excludes/);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("fails clearly when the master list is missing", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      expect(() => syncMcpServers([getHarness("claude")], dirs)).toThrow(/No master MCP list/);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });
});
