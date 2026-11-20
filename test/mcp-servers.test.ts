import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import {
  addMcpServer,
  getHarness,
  listMcpServers,
  McpEnvError,
  McpTransportError,
  registerHarness,
  removeMcpServer,
  syncMcpServers,
  type SyncTargetResult,
} from "../src/index.ts";
import Cursor from "../src/harnesses/cursor.ts";
import { mcpList, mcpSync } from "../src/tool-operations.ts";

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
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
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

  it("reads Pi mcp.json at both scopes", () => {
    const dirs = fixtureDirs();
    const userConfig = join(dirs.homeDir, ".pi", "agent", "mcp.json");
    const projectConfig = join(dirs.projectRoot, ".pi", "mcp.json");
    mkdirSync(dirname(userConfig), { recursive: true });
    mkdirSync(dirname(projectConfig), { recursive: true });
    writeFileSync(
      userConfig,
      JSON.stringify({
        autoEnableCodemode: true,
        mcpServers: {
          wiki: { command: "wiki-mcp", args: ["serve"], exposure: "direct", enabled: false },
          docs: { type: "streamable-http", url: "https://example.com/mcp", timeout: 30 },
        },
      }),
    );
    writeFileSync(projectConfig, JSON.stringify({ mcpServers: { tools: { command: "uvx" } } }));

    const listings = listMcpServers(getHarness("pi"), dirs);

    expect(listings.map((l) => [l.scope, l.path])).toEqual([
      ["user", userConfig],
      ["project", projectConfig],
    ]);
    expect(listings[0]?.servers).toEqual([
      { name: "wiki", transport: "stdio", command: "wiki-mcp", args: ["serve"], enabled: false },
      { name: "docs", transport: "http", url: "https://example.com/mcp" },
    ]);
    expect(listings[1]?.servers).toEqual([{ name: "tools", transport: "stdio", command: "uvx" }]);
  });

  it("lists a config once, as user, when the project root is the home directory", () => {
    const { homeDir } = fixtureDirs();
    const config = join(homeDir, ".codex", "config.toml");
    mkdirSync(dirname(config), { recursive: true });
    writeFileSync(config, '[mcp_servers.files]\ncommand = "npx"\n');

    const listings = listMcpServers(getHarness("codex"), { homeDir, projectRoot: homeDir });

    expect(listings.map((l) => [l.scope, l.path])).toEqual([["user", config]]);
    expect(listings[0]?.servers).toEqual([{ name: "files", transport: "stdio", command: "npx" }]);
    expect(
      listMcpServers(getHarness("codex"), { homeDir: `${homeDir}/`, projectRoot: homeDir }),
    ).toHaveLength(1);
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
          remote: {
            serverUrl: "https://example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
          short: { url: "https://example.com/other" },
          off: { command: "idle", disabled: true },
        },
      }),
    );

    const [listing] = listMcpServers(getHarness("antigravity"), dirs);

    expect(listing?.servers).toEqual([
      { name: "local", transport: "stdio", command: "node", args: ["srv.mjs"], env: { K: "v" } },
      {
        name: "remote",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
      { name: "short", transport: "http", url: "https://example.com/other" },
      { name: "off", transport: "stdio", command: "idle", enabled: false },
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

describe("mcpList by name", () => {
  it("keeps only the named server, still redacted", () => {
    withMcpListFixture(() => {
      writeFileSync(
        mcpListFixturePath,
        JSON.stringify({
          mcpServers: {
            probe: { command: "node", env: { API_TOKEN: "name-filter-secret" } },
            other: { command: "other" },
          },
        }),
      );

      const result = mcpList("cursor", "probe");
      if (!("harnesses" in result.details)) throw new Error("Expected an MCP listing");
      expect(result.details.harnesses).toHaveLength(1);
      expect(result.details.harnesses[0]?.configs).toHaveLength(1);
      expect(result.details.harnesses[0]?.configs[0]?.servers).toEqual([
        { name: "probe", transport: "stdio", command: "node", env: { API_TOKEN: "<redacted>" } },
      ]);
      expect(result.content[0]?.text).not.toContain("name-filter-secret");
    });
  });

  it("returns an empty list, not an error, when nothing matches", () => {
    withMcpListFixture(() => {
      writeFileSync(
        mcpListFixturePath,
        JSON.stringify({ mcpServers: { other: { command: "x" } } }),
      );

      const result = mcpList("cursor", "probe");
      expect(result.isError).toBeUndefined();
      expect(result.details).toEqual({ harnesses: [] });
    });
  });

  it("keeps a config it cannot parse, since the server might be in it", () => {
    withMcpListFixture(() => {
      writeFileSync(mcpListFixturePath, "{ not json");

      const result = mcpList("cursor", "probe");
      if (!("harnesses" in result.details)) throw new Error("Expected an MCP listing");
      expect(result.details.harnesses[0]?.configs[0]).toMatchObject({
        error: "Unable to read or parse MCP config",
        servers: [],
      });
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

  it("keeps the fields Pi adds to an entry while its transport stays", () => {
    const dirs = fixtureDirs();
    const pi = getHarness("pi");
    const config = join(dirs.homeDir, ".pi", "agent", "mcp.json");
    mkdirSync(dirname(config), { recursive: true });
    writeFileSync(
      config,
      JSON.stringify({
        mcpServers: {
          wiki: {
            command: "old",
            cwd: "~/wiki",
            exposure: "direct",
            description: "Search the wiki",
          },
          docs: { url: "https://example.com/mcp", oauth: { clientId: "pi" }, timeout: 30 },
        },
      }),
    );

    addMcpServer(pi, { name: "wiki", transport: "stdio", command: "wiki-mcp" }, "user", dirs);
    addMcpServer(pi, { name: "docs", transport: "stdio", command: "docs-mcp" }, "user", dirs);

    expect(nestedRecord(parseJsonRecord(config), "mcpServers")).toEqual({
      wiki: {
        type: "stdio",
        command: "wiki-mcp",
        cwd: "~/wiki",
        exposure: "direct",
        description: "Search the wiki",
      },
      docs: { type: "stdio", command: "docs-mcp" },
    });
  });

  it("refuses an sse server for Pi", () => {
    const dirs = fixtureDirs();

    expect(() =>
      addMcpServer(
        getHarness("pi"),
        { name: "events", transport: "sse", url: "https://example.com/sse" },
        "project",
        dirs,
      ),
    ).toThrow(McpTransportError);
    expect(existsSync(join(dirs.projectRoot, ".pi", "mcp.json"))).toBe(false);
  });

  it("writes the Antigravity serverUrl dialect shape with its headers", () => {
    const dirs = fixtureDirs();

    addMcpServer(
      getHarness("antigravity"),
      {
        name: "remote",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
      "user",
      dirs,
    );

    const path = join(dirs.homeDir, ".gemini", "config", "mcp_config.json");
    const raw = parseJsonRecord(path);
    expect(nestedRecord(raw, "mcpServers").remote).toEqual({
      serverUrl: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" },
    });
  });

  it("refuses an sse server for Antigravity", () => {
    const dirs = fixtureDirs();

    expect(() =>
      addMcpServer(
        getHarness("antigravity"),
        { name: "events", transport: "sse", url: "https://example.com/sse" },
        "user",
        dirs,
      ),
    ).toThrow(McpTransportError);
    expect(existsSync(join(dirs.homeDir, ".gemini", "config", "mcp_config.json"))).toBe(false);
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

  /** Umask 022 trims 660, so that case fails without the chmod. */
  it.each([
    ["600", 0o600],
    ["660", 0o660],
  ])("keeps a %s config at that mode through add and remove", (_, want) => {
    const dirs = fixtureDirs();
    const codex = getHarness("codex");
    const configPath = join(dirs.homeDir, ".codex", "config.toml");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, '[mcp_servers.keep]\ncommand = "x"\n');
    chmodSync(configPath, want);
    const mode = (): number => statSync(configPath).mode & 0o777;

    addMcpServer(codex, { name: "hub", transport: "http", url: "http://h/mcp" }, "user", dirs);
    expect(mode()).toBe(want);

    removeMcpServer(codex, "hub", "user", dirs);
    expect(mode()).toBe(want);
  });

  it.each([
    ["codex", ".codex"],
    ["grok", ".grok"],
  ] as const)("finds a %s server whatever spacing or quoting its header uses", (id, dir) => {
    const harness = getHarness(id);
    for (const head of ["[ mcp_servers.x ]", '["mcp_servers".x]', "[mcp_servers . 'x']"]) {
      const dirs = fixtureDirs();
      const path = join(dirs.homeDir, dir, "config.toml");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `[mcp_servers.keep]\ncommand = "k"\n\n${head}\ncommand = "old"\n\n[ mcp_servers.x.env ]\nK = "v"\n`,
      );

      addMcpServer(harness, { name: "x", transport: "stdio", command: "new" }, "user", dirs);
      expect(readFileSync(path, "utf8"), head).not.toMatch(/old|K = /);
      expect(removeMcpServer(harness, "x", "user", dirs), head).toEqual({ path, removed: true });
      expect(readFileSync(path, "utf8"), head).toBe('[mcp_servers.keep]\ncommand = "k"\n');
    }
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

  it("edits a Kilo JSONC config in place, comments and trailing commas kept", () => {
    const dirs = fixtureDirs();
    const kilo = getHarness("kilo");
    const path = join(dirs.homeDir, ".config", "kilo", "kilo.jsonc");
    const original = `{
  // shared by every project
  "permission": { "bash": "ask" }, // keep
  "mcp": {
    "keep": { "type": "local", "command": ["npx", "-y", "srv"] },
  },
}
`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, original);

    const added = addMcpServer(
      kilo,
      { name: "probe", transport: "http", url: "https://example.com/mcp" },
      "user",
      dirs,
    );
    expect(added).toEqual({ path, replaced: false });

    const afterAdd = readFileSync(path, "utf8");
    expect(afterAdd).toContain("// shared by every project");
    expect(afterAdd).toContain('"permission": { "bash": "ask" }, // keep');
    const listing = listMcpServers(kilo, dirs).find((l) => l.path === path);
    expect(listing?.format).toBe("jsonc");
    expect(listing?.servers).toEqual([
      { name: "keep", transport: "stdio", command: "npx", args: ["-y", "srv"] },
      { name: "probe", transport: "http", url: "https://example.com/mcp" },
    ]);

    expect(removeMcpServer(kilo, "probe", "user", dirs)).toEqual({ path, removed: true });
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(removeMcpServer(kilo, "probe", "user", dirs).removed).toBe(false);
    expect(existsSync(join(dirs.homeDir, ".config", "kilo", "kilo.json"))).toBe(false);
  });

  it("writes to the user file the harness itself would pick", () => {
    const dirs = fixtureDirs();
    const server = { name: "probe", transport: "stdio" as const, command: "node" };
    const kiloDir = join(dirs.homeDir, ".config", "kilo");
    const opencodeDir = join(dirs.homeDir, ".config", "opencode");
    mkdirSync(kiloDir, { recursive: true });
    mkdirSync(opencodeDir, { recursive: true });

    expect(addMcpServer(getHarness("kilo"), server, "user", dirs).path).toBe(
      join(kiloDir, "kilo.jsonc"),
    );

    writeFileSync(join(opencodeDir, "opencode.jsonc"), "{ /* mine */ }\n");
    expect(addMcpServer(getHarness("opencode"), server, "user", dirs).path).toBe(
      join(opencodeDir, "opencode.jsonc"),
    );
    writeFileSync(join(opencodeDir, "opencode.json"), "{}\n");
    expect(addMcpServer(getHarness("opencode"), server, "user", dirs).path).toBe(
      join(opencodeDir, "opencode.json"),
    );
  });

  it("leaves Claude's .mcp.json alone when Mastra Code writes its project servers", () => {
    const dirs = fixtureDirs();
    const claudeFile = join(dirs.projectRoot, ".mcp.json");
    writeFileSync(claudeFile, '{ "mcpServers": { "claude": { "command": "c" } } }\n');

    const added = addMcpServer(
      getHarness("mastracode"),
      { name: "probe", transport: "stdio", command: "node" },
      "project",
      dirs,
    );

    expect(added.path).toBe(join(dirs.projectRoot, ".mastracode", "mcp.json"));
    expect(readFileSync(claudeFile, "utf8")).toBe(
      '{ "mcpServers": { "claude": { "command": "c" } } }\n',
    );
  });

  it("removes a server from every Kilo file it is merged from", () => {
    const dirs = fixtureDirs();
    const kilo = getHarness("kilo");
    const dir = join(dirs.homeDir, ".config", "kilo");
    mkdirSync(dir, { recursive: true });
    const jsonc = join(dir, "kilo.jsonc");
    const json = join(dir, "kilo.json");
    writeFileSync(jsonc, "{}\n");
    writeFileSync(json, JSON.stringify({ mcp: { probe: { type: "local", command: ["x"] } } }));

    expect(removeMcpServer(kilo, "probe", "user", dirs)).toEqual({ path: json, removed: true });
    expect(parseJsonRecord(json)).toEqual({ mcp: {} });

    writeFileSync(jsonc, '{ "mcp": { "probe": { "type": "local", "command": ["y"] } } }\n');
    writeFileSync(json, JSON.stringify({ mcp: { probe: { type: "local", command: ["x"] } } }));
    expect(removeMcpServer(kilo, "probe", "user", dirs)).toEqual({ path: jsonc, removed: true });
    const servers = listMcpServers(kilo, dirs).flatMap((l) => l.servers);
    expect(servers).toEqual([]);
  });

  it("refuses a JSONC edit when the server map is not an object", () => {
    const dirs = fixtureDirs();
    const path = join(dirs.homeDir, ".config", "kilo", "kilo.jsonc");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{ "mcp": [] }\n');

    expect(() =>
      addMcpServer(
        getHarness("kilo"),
        { name: "x", transport: "stdio", command: "y" },
        "user",
        dirs,
      ),
    ).toThrow(/non-object at mcp/);
    expect(readFileSync(path, "utf8")).toBe('{ "mcp": [] }\n');
  });

  it("refuses a project-scope write that would land in the user config", () => {
    const { homeDir } = fixtureDirs();
    const dirs = { homeDir, projectRoot: homeDir };
    const server = { name: "x", transport: "stdio" as const, command: "y" };

    expect(() => addMcpServer(getHarness("codex"), server, "project", dirs)).toThrow(
      /project-scope MCP config is the user config .*config\.toml.*scope "user"/,
    );
    expect(() => removeMcpServer(getHarness("codex"), "x", "project", dirs)).toThrow(
      /project-scope MCP config is the user config/,
    );
    expect(existsSync(join(homeDir, ".codex", "config.toml"))).toBe(false);
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

  it("fills a header reference once, even when the value holds a reference of its own", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HARNESSES_TEST_TOKEN", "literal${HARNESSES_TEST_INNER}");
    vi.stubEnv("HARNESSES_TEST_INNER", undefined);
    vi.stubEnv("XDG_CONFIG_HOME", undefined);
    onTestFinished(() => vi.unstubAllEnvs());
    writeMaster(
      dirs.homeDir,
      `{ "mcpServers": { "hub": { "url": "http://h/mcp", "headers": { "Authorization": "Bearer \${HARNESSES_TEST_TOKEN}" } } } }`,
    );

    const report = syncMcpServers([getHarness("claude")], dirs);

    expect(targetResults(report.targets, "claude")).toEqual([{ name: "hub", action: "added" }]);
    const servers = listMcpServers(getHarness("claude"), dirs).find(
      (l) => l.scope === "user",
    )?.servers;
    expect(servers?.[0]?.headers).toEqual({
      Authorization: "Bearer literal${HARNESSES_TEST_INNER}",
    });
  });

  it("reports in check mode what the sync then does, without writing", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("XDG_CONFIG_HOME", undefined);
    writeMaster(
      dirs.homeDir,
      JSON.stringify({
        keep: { grok: ["mine"] },
        mcpServers: { probe: { command: "node" }, cloud: { url: "https://example.com/mcp" } },
      }),
    );
    const claudePath = join(dirs.homeDir, ".claude.json");
    const grokPath = join(dirs.homeDir, ".grok", "config.toml");
    writeFileSync(
      claudePath,
      JSON.stringify({ mcpServers: { probe: "old", stale: { command: "x" } } }),
    );
    mkdirSync(dirname(grokPath), { recursive: true });
    writeFileSync(grokPath, '# grok\n[mcp_servers.mine]\ncommand = "own"\n');
    const before = [readFileSync(claudePath, "utf8"), readFileSync(grokPath, "utf8")];
    const targets = [getHarness("claude"), getHarness("grok"), getHarness("codex")];

    const check = syncMcpServers(targets, { ...dirs, check: true });

    expect(check.check).toBe(true);
    expect(targetResults(check.targets, "claude")).toEqual([
      { name: "probe", action: "replaced" },
      { name: "cloud", action: "added" },
      { name: "stale", action: "removed" },
    ]);
    expect(targetResults(check.targets, "grok")).toEqual([
      { name: "probe", action: "added" },
      { name: "cloud", action: "added" },
      { name: "mine", action: "kept" },
    ]);
    expect([readFileSync(claudePath, "utf8"), readFileSync(grokPath, "utf8")]).toEqual(before);
    expect(existsSync(join(dirs.homeDir, ".codex", "config.toml"))).toBe(false);

    const sync = syncMcpServers(targets, dirs);
    expect(sync.check).toBe(false);
    expect(sync.targets.map((t) => t.results)).toEqual(check.targets.map((t) => t.results));
  });

  it.each([
    [
      "an inline table it would replace",
      'mcp_servers = { probe = { command = "old" } }\n',
      /redefine/,
    ],
    ["a dotted key it would remove", '[mcp_servers]\nstale.command = "x"\n', /stale absent/],
  ])("refuses in check mode the TOML edit sync refuses: %s", (_, toml, error) => {
    const dirs = fixtureDirs();
    vi.stubEnv("XDG_CONFIG_HOME", undefined);
    writeMaster(dirs.homeDir, JSON.stringify({ mcpServers: { probe: { command: "node" } } }));
    const path = join(dirs.homeDir, ".codex", "config.toml");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, toml);
    const codex = [getHarness("codex")];

    expect(() => syncMcpServers(codex, { ...dirs, check: true })).toThrow(error);
    expect(readFileSync(path, "utf8")).toBe(toml);
    expect(() => syncMcpServers(codex, dirs)).toThrow(error);
  });

  it("refuses an unknown harness in check mode before reading any config", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HOME", dirs.homeDir);
    vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
    writeMaster(dirs.homeDir, JSON.stringify({ excludes: ["codxe"], mcpServers: {} }));

    const result = mcpSync("claude", true);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      error: "Master MCP list names unknown harnesses: codxe (excludes)",
    });
  });

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

  it("syncs a commented Kilo JSONC config and is idempotent", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("XDG_CONFIG_HOME", undefined);
    writeMaster(dirs.homeDir, master);
    const path = join(dirs.homeDir, ".config", "kilo", "kilo.jsonc");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      '{\n  // my rules\n  "permission": { "*": "allow" },\n  "mcp": { "old": { "type": "remote", "url": "https://old" } },\n}\n',
    );

    const first = syncMcpServers([getHarness("kilo")], dirs);
    expect(first.targets[0]).toEqual({
      id: "kilo",
      path,
      results: [
        { name: "probe", action: "added" },
        { name: "cloud", action: "added" },
        { name: "old", action: "removed" },
      ],
    });
    expect(readFileSync(path, "utf8")).toContain("// my rules");

    const second = syncMcpServers([getHarness("kilo")], dirs);
    expect(second.targets[0]?.results.map((r) => r.action)).toEqual(["unchanged", "unchanged"]);
  });

  it("clears the other Kilo file it merges, apart from what keep names", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("XDG_CONFIG_HOME", undefined);
    writeMaster(
      dirs.homeDir,
      JSON.stringify({ keep: { kilo: ["mine"] }, mcpServers: { probe: { command: "node" } } }),
    );
    const dir = join(dirs.homeDir, ".config", "kilo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "kilo.jsonc"), "{}\n");
    const json = join(dir, "kilo.json");
    writeFileSync(
      json,
      JSON.stringify({
        theme: "dark",
        mcp: {
          probe: { type: "local", command: ["node"] },
          extra: { type: "remote", url: "https://x" },
          mine: { type: "remote", url: "https://mine" },
        },
      }),
    );

    const first = syncMcpServers([getHarness("kilo")], dirs);
    expect(first.targets[0]?.results).toEqual([
      { name: "probe", action: "added" },
      { name: "probe", action: "removed", path: json },
      { name: "extra", action: "removed", path: json },
      { name: "mine", action: "kept", path: json },
    ]);
    expect(parseJsonRecord(json)).toEqual({
      theme: "dark",
      mcp: { mine: { type: "remote", url: "https://mine" } },
    });

    const second = syncMcpServers([getHarness("kilo")], dirs);
    expect(second.targets[0]?.results).toEqual([
      { name: "probe", action: "unchanged" },
      { name: "mine", action: "kept", path: json },
    ]);
  });

  it("keeps a sibling entry whose replacement the target had to skip", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("XDG_CONFIG_HOME", undefined);
    vi.stubEnv("HARNESSES_TEST_UNSET", undefined);
    writeMaster(
      dirs.homeDir,
      JSON.stringify({
        mcpServers: { hub: { command: "node", env: { T: "${HARNESSES_TEST_UNSET}" } } },
      }),
    );
    const dir = join(dirs.homeDir, ".config", "kilo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "kilo.jsonc"), "// mine\n");
    const json = join(dir, "kilo.json");
    const working = { mcp: { hub: { type: "local", command: ["node"], environment: { T: "v" } } } };
    writeFileSync(json, JSON.stringify(working));

    const report = syncMcpServers([getHarness("kilo")], dirs);

    expect(report.targets[0]?.results.map((r) => r.action)).toEqual(["skipped"]);
    expect(parseJsonRecord(json)).toEqual(working);
  });

  it("writes into a JSONC config that holds only comments", () => {
    const dirs = fixtureDirs();
    const path = join(dirs.homeDir, ".config", "kilo", "kilo.jsonc");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "// nothing here yet\n");

    addMcpServer(getHarness("kilo"), { name: "x", transport: "stdio", command: "n" }, "user", dirs);

    expect(readFileSync(path, "utf8").startsWith("// nothing here yet\n{\n")).toBe(true);
    expect(listMcpServers(getHarness("kilo"), dirs).find((l) => l.path === path)?.servers).toEqual([
      { name: "x", transport: "stdio", command: "n" },
    ]);
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

  it("syncs Pi and skips an sse server it cannot hold", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        JSON.stringify({
          mcpServers: {
            probe: { command: "node", args: ["srv.mjs"] },
            events: { type: "sse", url: "https://example.com/sse" },
          },
        }),
      );

      const first = syncMcpServers([getHarness("pi")], dirs);
      expect(targetResults(first.targets, "pi")).toEqual([
        { name: "probe", action: "added" },
        {
          name: "events",
          action: "skipped",
          reason: expect.stringContaining("not sse") as string,
        },
      ]);
      const raw = parseJsonRecord(join(dirs.homeDir, ".pi", "agent", "mcp.json"));
      expect(nestedRecord(raw, "mcpServers")).toEqual({
        probe: { type: "stdio", command: "node", args: ["srv.mjs"] },
      });

      const second = syncMcpServers([getHarness("pi")], dirs);
      expect(targetResults(second.targets, "pi").map((r) => r.action)).toEqual([
        "unchanged",
        "skipped",
      ]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("syncs an HTTP server with a header token into Antigravity once", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    const previousToken = process.env.HARNESSES_TEST_TOKEN;
    delete process.env.XDG_CONFIG_HOME;
    process.env.HARNESSES_TEST_TOKEN = "secret";
    try {
      writeMaster(
        dirs.homeDir,
        JSON.stringify({
          mcpServers: {
            hub: {
              type: "http",
              url: "http://127.0.0.1:7340/mcp/hub",
              headers: { Authorization: "Bearer ${HARNESSES_TEST_TOKEN}" },
            },
          },
        }),
      );
      const path = join(dirs.homeDir, ".gemini", "config", "mcp_config.json");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ mcpServers: {} }));

      const first = syncMcpServers([getHarness("antigravity")], dirs);
      expect(targetResults(first.targets, "antigravity")).toEqual([
        { name: "hub", action: "added" },
      ]);
      expect(nestedRecord(parseJsonRecord(path), "mcpServers").hub).toEqual({
        serverUrl: "http://127.0.0.1:7340/mcp/hub",
        headers: { Authorization: "Bearer secret" },
      });

      const second = syncMcpServers([getHarness("antigravity")], dirs);
      expect(targetResults(second.targets, "antigravity")).toEqual([
        { name: "hub", action: "unchanged" },
      ]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
      if (previousToken === undefined) delete process.env.HARNESSES_TEST_TOKEN;
      else process.env.HARNESSES_TEST_TOKEN = previousToken;
    }
  });

  it("syncs a disabled server into Antigravity as disabled, once", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        JSON.stringify({
          mcpServers: {
            off: { type: "http", url: "https://example.com/mcp", enabled: false },
            on: { command: "wiki", enabled: true },
          },
        }),
      );
      const path = join(dirs.homeDir, ".gemini", "config", "mcp_config.json");

      syncMcpServers([getHarness("antigravity")], dirs);
      expect(nestedRecord(parseJsonRecord(path), "mcpServers")).toEqual({
        off: { serverUrl: "https://example.com/mcp", disabled: true },
        on: { command: "wiki", disabled: false },
      });

      const second = syncMcpServers([getHarness("antigravity")], dirs);
      expect(targetResults(second.targets, "antigravity")).toEqual([
        { name: "off", action: "unchanged" },
        { name: "on", action: "unchanged" },
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

      const report = syncMcpServers([getHarness("claude"), getHarness("github-copilot")], dirs);

      const claude = report.targets.find((t) => t.id === "claude");
      expect(claude?.results).toEqual([
        { name: "probe", action: "replaced" },
        { name: "cloud", action: "added" },
      ]);
      expect(report.targets.find((t) => t.id === "github-copilot")?.skipped).toContain(
        "no user-scope",
      );
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

  it("leaves a harness's own servers alone when keep names them", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      writeMaster(
        dirs.homeDir,
        `{
  // only codex can run node_repl
  "keep": { "codex": ["node_repl"] },
  "mcpServers": { "probe": { "command": "node" } },
}`,
      );
      mkdirSync(join(dirs.homeDir, ".codex"), { recursive: true });
      writeFileSync(
        join(dirs.homeDir, ".codex", "config.toml"),
        '[mcp_servers.node_repl]\ncommand = "node_repl"\n\n[mcp_servers.stray]\ncommand = "stray"\n',
      );
      addMcpServer(
        getHarness("claude"),
        { name: "node_repl", transport: "stdio", command: "node_repl" },
        "user",
        dirs,
      );
      const targets = [getHarness("codex"), getHarness("claude")];

      const first = syncMcpServers(targets, dirs);
      expect(targetResults(first.targets, "codex")).toEqual([
        { name: "probe", action: "added" },
        { name: "node_repl", action: "kept" },
        { name: "stray", action: "removed" },
      ]);
      expect(targetResults(first.targets, "claude")).toEqual([
        { name: "probe", action: "added" },
        { name: "node_repl", action: "removed" },
      ]);
      const codexServers = listMcpServers(getHarness("codex"), dirs).find(
        (l) => l.scope === "user",
      )?.servers;
      expect(codexServers?.map((s) => s.name).sort()).toEqual(["node_repl", "probe"]);

      const second = syncMcpServers(targets, dirs);
      expect(targetResults(second.targets, "codex")).toEqual([
        { name: "probe", action: "unchanged" },
        { name: "node_repl", action: "kept" },
      ]);
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  describe("a server's own excludes", () => {
    function masterWith(
      excludes: readonly string[],
      cloud: Readonly<Record<string, unknown>> = {},
    ): string {
      return JSON.stringify({
        excludes,
        mcpServers: {
          probe: { command: "node" },
          cloud: { url: "https://example.com/mcp", ...cloud },
        },
      });
    }

    function claudeServerNames(dirs: Readonly<{ homeDir: string }>): string[] {
      const listing = listMcpServers(getHarness("claude"), dirs).find((l) => l.scope === "user");
      return (listing?.servers ?? []).map((s) => s.name).sort();
    }

    it("lets an excluded harness have the one server that opts back in", () => {
      const dirs = fixtureDirs();
      vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
      writeMaster(dirs.homeDir, masterWith(["claude", "codex"], { excludes: [] }));
      addMcpServer(
        getHarness("claude"),
        { name: "mine", transport: "stdio", command: "own-server" },
        "user",
        dirs,
      );
      const targets = [getHarness("claude"), getHarness("codex")];

      const first = syncMcpServers(targets, dirs);

      const claude = first.targets.find((t) => t.id === "claude");
      expect(claude?.excluded).toBe(true);
      expect(claude?.results).toEqual([{ name: "cloud", action: "added" }]);
      expect(targetResults(first.targets, "codex")).toEqual([{ name: "cloud", action: "added" }]);
      expect(claudeServerNames(dirs)).toEqual(["cloud", "mine"]);
      const raw = JSON.parse(readFileSync(join(dirs.homeDir, ".claude.json"), "utf8")) as Record<
        string,
        unknown
      >;
      expect(nestedRecord(nestedRecord(raw, "mcpServers"), "cloud")).not.toHaveProperty("excludes");

      const second = syncMcpServers(targets, dirs);
      expect(targetResults(second.targets, "claude")).toEqual([
        { name: "cloud", action: "unchanged" },
      ]);
    });

    it("keeps out only the harnesses a server's own excludes names", () => {
      const dirs = fixtureDirs();
      vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
      writeMaster(dirs.homeDir, masterWith(["claude", "codex"], { excludes: ["codex"] }));

      const report = syncMcpServers([getHarness("claude"), getHarness("codex")], dirs);

      expect(targetResults(report.targets, "claude")).toEqual([{ name: "cloud", action: "added" }]);
      expect(targetResults(report.targets, "codex")).toEqual([]);
      const codex = listMcpServers(getHarness("codex"), dirs).find((l) => l.scope === "user");
      expect(codex?.exists).toBe(false);
    });

    it("withdraws a server once its own excludes shuts the harness out again", () => {
      const dirs = fixtureDirs();
      vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
      const claude = [getHarness("claude")];
      writeMaster(dirs.homeDir, masterWith([]));
      syncMcpServers(claude, dirs);

      writeMaster(dirs.homeDir, masterWith([], { excludes: ["claude"] }));
      expect(targetResults(syncMcpServers(claude, dirs).targets, "claude")).toEqual([
        { name: "probe", action: "unchanged" },
        { name: "cloud", action: "removed" },
      ]);
      expect(claudeServerNames(dirs)).toEqual(["probe"]);

      addMcpServer(
        getHarness("claude"),
        { name: "mine", transport: "stdio", command: "own-server" },
        "user",
        dirs,
      );
      writeMaster(dirs.homeDir, masterWith(["claude"], { excludes: [] }));
      expect(targetResults(syncMcpServers(claude, dirs).targets, "claude")).toEqual([
        { name: "cloud", action: "added" },
        { name: "probe", action: "removed" },
      ]);

      writeMaster(dirs.homeDir, masterWith(["claude"]));
      expect(targetResults(syncMcpServers(claude, dirs).targets, "claude")).toEqual([
        { name: "cloud", action: "removed" },
      ]);
      expect(claudeServerNames(dirs)).toEqual(["mine"]);
    });

    it("rejects a server excludes that is not an array of strings", () => {
      const dirs = fixtureDirs();
      vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
      for (const excludes of ["codex", {}, [1]]) {
        writeMaster(dirs.homeDir, masterWith([], { excludes }));
        expect(() => syncMcpServers([getHarness("claude")], dirs)).toThrow(
          /invalid excludes on cloud/,
        );
      }
    });

    it("refuses to sync when a server excludes names an unknown harness", () => {
      const dirs = fixtureDirs();
      vi.stubEnv("HOME", dirs.homeDir);
      vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
      writeMaster(dirs.homeDir, masterWith([], { excludes: ["codxe"] }));

      const result = mcpSync("claude");

      expect(result.isError).toBe(true);
      expect(result.details).toMatchObject({
        error: "Master MCP list names unknown harnesses: codxe (excludes of cloud)",
      });
      expect(existsSync(join(dirs.homeDir, ".claude.json"))).toBe(false);
    });
  });

  it("rejects a keep field that does not map harness ids to server names", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      for (const keep of [[], ["codex"], { codex: "node_repl" }, { codex: [1] }]) {
        writeMaster(dirs.homeDir, JSON.stringify({ keep, mcpServers: {} }));
        expect(() => syncMcpServers([getHarness("claude")], dirs)).toThrow(/invalid keep/);
      }
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });

  it("refuses to sync when keep names an unknown harness", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HOME", dirs.homeDir);
    vi.stubEnv("XDG_CONFIG_HOME", join(dirs.homeDir, ".config"));
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    writeMaster(
      dirs.homeDir,
      JSON.stringify({
        keep: { codxe: ["node_repl"] },
        mcpServers: { probe: { command: "node" } },
      }),
    );

    const result = mcpSync("claude");

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      error: "Master MCP list names unknown harnesses: codxe (keep)",
    });
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

  it("refuses a master list whose mcpServers is not an object, before touching any harness", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      const codexConfig = join(dirs.homeDir, ".codex", "config.toml");
      mkdirSync(dirname(codexConfig), { recursive: true });
      writeFileSync(codexConfig, '[mcp_servers.mine]\ncommand = "mine"\n');
      for (const master of [{}, { mcpServers: [] }, { mcpServers: ["probe"] }]) {
        writeMaster(dirs.homeDir, JSON.stringify(master));
        expect(() => syncMcpServers([getHarness("codex")], dirs)).toThrow(
          /has no mcpServers object/,
        );
        expect(readFileSync(codexConfig, "utf8")).toBe('[mcp_servers.mine]\ncommand = "mine"\n');
      }
    } finally {
      if (previousXdg !== undefined) process.env.XDG_CONFIG_HOME = previousXdg;
    }
  });
});

describe("codex HTTP headers", () => {
  it("writes headers as http_headers and reads them back", () => {
    const dirs = fixtureDirs();
    const codex = getHarness("codex");

    addMcpServer(
      codex,
      {
        name: "hub",
        transport: "http",
        url: "http://127.0.0.1:7340/mcp/hub",
        headers: { Authorization: "Bearer t" },
      },
      "user",
      dirs,
    );

    const written = readFileSync(join(dirs.homeDir, ".codex/config.toml"), "utf8");
    expect(written).toContain("[mcp_servers.hub.http_headers]");
    expect(written).not.toContain("[mcp_servers.hub.headers]");
    const servers = listMcpServers(codex, dirs).find((l) => l.scope === "user")?.servers;
    expect(servers).toEqual([
      {
        name: "hub",
        transport: "http",
        url: "http://127.0.0.1:7340/mcp/hub",
        headers: { Authorization: "Bearer t" },
      },
    ]);
  });
});

describe("header references", () => {
  it("fills ${NAME} inside a header value from the environment", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HARNESSES_TEST_HUB_TOKEN", "s3cret");
    onTestFinished(() => vi.unstubAllEnvs());

    addMcpServer(
      getHarness("claude"),
      {
        name: "hub",
        transport: "http",
        url: "http://h/mcp",
        headers: { Authorization: "Bearer ${HARNESSES_TEST_HUB_TOKEN}", "X-Plain": "keep" },
      },
      "user",
      dirs,
    );

    const servers = listMcpServers(getHarness("claude"), dirs).find(
      (l) => l.scope === "user",
    )?.servers;
    expect(servers?.[0]?.headers).toEqual({ Authorization: "Bearer s3cret", "X-Plain": "keep" });
  });

  it("refuses a header that references an unset variable", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HARNESSES_TEST_UNSET_TOKEN", undefined);
    onTestFinished(() => vi.unstubAllEnvs());

    expect(() =>
      addMcpServer(
        getHarness("claude"),
        {
          name: "hub",
          transport: "http",
          url: "http://h/mcp",
          headers: { Authorization: "Bearer ${HARNESSES_TEST_UNSET_TOKEN}" },
        },
        "user",
        dirs,
      ),
    ).toThrow(/hub: header Authorization references HARNESSES_TEST_UNSET_TOKEN, which is not set/);
  });
});

describe("header references for Prime Agent", () => {
  it("fills header references while env keeps its references", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("HARNESSES_TEST_HUB_TOKEN", "s3cret");
    onTestFinished(() => vi.unstubAllEnvs());
    const prime = getHarness("prime-agent");

    addMcpServer(
      prime,
      {
        name: "hub",
        transport: "http",
        url: "http://h/mcp",
        headers: { Authorization: "Bearer ${HARNESSES_TEST_HUB_TOKEN}" },
      },
      "user",
      dirs,
    );

    const servers = listMcpServers(prime, dirs).find((l) => l.scope === "user")?.servers;
    expect(servers?.[0]?.headers).toEqual({ Authorization: "Bearer s3cret" });
  });
});

describe("Mistral Vibe [[mcp_servers]]", () => {
  /** What `vibe mcp add` 3.1.3 writes, plus a comment and a key of the user's own. */
  const VIBE_CONFIG = `# my vibe
theme = "auto" # keep

[[mcp_servers]]
name = "fetch_server"
transport = "stdio"
command = "/opt/my tools/uvx"
args = [
    "mcp-server-fetch",
]

[mcp_servers.env]
K = "v"

# the hosted one
[[mcp_servers]]
url = "https://mcp.example.org/mcp"
name = "oauth1"
transport = "streamable-http"

[mcp_servers.auth]
type = "oauth"
scopes = []

[tools.bash]
permission = "ask"
`;

  /* Writes the config into a fresh home and returns its path. */
  function vibeConfig(homeDir: string, body: string): string {
    const path = join(homeDir, ".vibe", "config.toml");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    return path;
  }

  it("reads the tables Vibe writes, a list command and auth headers included", () => {
    const dirs = fixtureDirs();
    vibeConfig(
      dirs.homeDir,
      `${VIBE_CONFIG}
[[mcp_servers]]
name = "argv"
transport = "stdio"
command = ["node", "srv.mjs"]
args = ["mcp"]
disabled = true

[[mcp_servers]]
name = "legacy"
transport = "http"
url = "https://example.com/mcp"
headers = { "X-Client" = "vibe" }
`,
    );

    expect(listMcpServers(getHarness("vibe"), dirs)[0]?.servers).toEqual([
      {
        name: "fetch_server",
        transport: "stdio",
        command: "/opt/my tools/uvx",
        args: ["mcp-server-fetch"],
        env: { K: "v" },
      },
      { name: "oauth1", transport: "http", url: "https://mcp.example.org/mcp" },
      {
        name: "argv",
        transport: "stdio",
        command: "node",
        args: ["srv.mjs", "mcp"],
        enabled: false,
      },
      {
        name: "legacy",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { "X-Client": "vibe" },
      },
    ]);
  });

  it("replaces and removes one table, every other line kept", () => {
    const dirs = fixtureDirs();
    const vibe = getHarness("vibe");
    const path = vibeConfig(dirs.homeDir, VIBE_CONFIG);

    expect(
      addMcpServer(
        vibe,
        {
          name: "fetch_server",
          transport: "stdio",
          command: "/opt/dir with space/srv",
          args: ["a b"],
        },
        "user",
        dirs,
      ),
    ).toEqual({ path, replaced: true });
    addMcpServer(
      vibe,
      {
        name: "remote",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer t" },
        enabled: false,
      },
      "user",
      dirs,
    );

    const written = readFileSync(path, "utf8");
    expect(written).toContain(
      '# my vibe\ntheme = "auto" # keep\n\n# the hosted one\n[[mcp_servers]]',
    );
    expect(written).toContain('[tools.bash]\npermission = "ask"');
    expect(written).toContain('command = ["/opt/dir with space/srv"]');
    expect(written).toContain(
      '[[mcp_servers]]\nname = "remote"\ntransport = "streamable-http"\nurl = "https://example.com/mcp"\ndisabled = true\n\n[mcp_servers.auth]\ntype = "static"\n\n[mcp_servers.auth.headers]\nAuthorization = "Bearer t"\n',
    );
    expect(listMcpServers(vibe, dirs)[0]?.servers.map((server) => server.name)).toEqual([
      "oauth1",
      "fetch_server",
      "remote",
    ]);

    expect(removeMcpServer(vibe, "oauth1", "user", dirs)).toEqual({ path, removed: true });
    const after = readFileSync(path, "utf8");
    expect(after).not.toContain("oauth1");
    expect(after).toContain("# the hosted one");
    expect(after).toContain('[tools.bash]\npermission = "ask"');
    expect(listMcpServers(vibe, dirs)[0]?.servers.find((s) => s.name === "remote")).toEqual({
      name: "remote",
      transport: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer t" },
      enabled: false,
    });
  });

  it("refuses names Vibe would rewrite and sse before writing anything", () => {
    const dirs = fixtureDirs();
    const vibe = getHarness("vibe");
    const path = vibeConfig(dirs.homeDir, VIBE_CONFIG);

    for (const name of ["two words", "_x", "a.b", "x-"]) {
      expect(() =>
        addMcpServer(vibe, { name, transport: "stdio", command: "n" }, "user", dirs),
      ).toThrow(/Mistral Vibe takes letters, digits, _ and -/);
    }
    expect(() =>
      addMcpServer(vibe, { name: "ev", transport: "sse", url: "https://e/sse" }, "user", dirs),
    ).toThrow(McpTransportError);
    expect(readFileSync(path, "utf8")).toBe(VIBE_CONFIG);
  });

  it("adds the first server after vibe mcp remove left an empty array behind", () => {
    const dirs = fixtureDirs();
    const path = vibeConfig(dirs.homeDir, 'theme = "auto"\nmcp_servers = []\n');

    addMcpServer(getHarness("vibe"), { name: "x", transport: "stdio", command: "n" }, "user", dirs);

    expect(readFileSync(path, "utf8")).toBe(
      'theme = "auto"\n\n[[mcp_servers]]\nname = "x"\ntransport = "stdio"\ncommand = ["n"]\n',
    );
  });

  it("finds a table whatever spacing or quoting its header uses", () => {
    const vibe = getHarness("vibe");
    for (const head of ["[[ mcp_servers ]]", '[["mcp_servers"]]']) {
      const dirs = fixtureDirs();
      const path = vibeConfig(
        dirs.homeDir,
        `${head}\nname = "x"\ntransport = "stdio"\ncommand = "old"\n\n[ mcp_servers.env ]\nK = "v"\n`,
      );

      addMcpServer(vibe, { name: "x", transport: "stdio", command: "new" }, "user", dirs);
      expect(listMcpServers(vibe, dirs)[0]?.servers, head).toEqual([
        { name: "x", transport: "stdio", command: "new" },
      ]);
      expect(readFileSync(path, "utf8"), head).not.toContain("old");
      expect(removeMcpServer(vibe, "x", "user", dirs), head).toEqual({ path, removed: true });
      expect(readFileSync(path, "utf8"), head).toBe("");
    }
  });

  it("syncs into a commented config and is idempotent", () => {
    const dirs = fixtureDirs();
    vi.stubEnv("XDG_CONFIG_HOME", "");
    const master = join(dirs.homeDir, ".config", "agntn", "mcp.jsonc");
    mkdirSync(dirname(master), { recursive: true });
    writeFileSync(
      master,
      JSON.stringify({
        mcpServers: {
          probe: { command: "node", args: ["srv.mjs"] },
          events: { type: "sse", url: "https://example.com/sse" },
        },
      }),
    );
    const path = vibeConfig(dirs.homeDir, VIBE_CONFIG);

    const first = syncMcpServers([getHarness("vibe")], dirs);
    expect(first.targets[0]?.results).toEqual([
      { name: "probe", action: "added" },
      { name: "events", action: "skipped", reason: expect.stringContaining("not sse") as string },
      { name: "fetch_server", action: "removed" },
      { name: "oauth1", action: "removed" },
    ]);
    const written = readFileSync(path, "utf8");
    expect(written).toContain('# my vibe\ntheme = "auto" # keep');
    expect(written).toContain('[tools.bash]\npermission = "ask"');

    const second = syncMcpServers([getHarness("vibe")], dirs);
    expect(second.targets[0]?.results.map((row) => row.action)).toEqual(["unchanged", "skipped"]);
    expect(readFileSync(path, "utf8")).toBe(written);
  });
});
