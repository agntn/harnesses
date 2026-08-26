import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addMcpServer,
  getHarness,
  listMcpServers,
  removeMcpServer,
  syncMcpServers,
} from "../src/index.ts";

function fixtureDirs(): { homeDir: string; projectRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "harnesses-mcp-"));
  const homeDir = join(root, "home");
  const projectRoot = join(root, "project");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  return { homeDir, projectRoot };
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

    const raw = JSON.parse(readFileSync(join(dirs.homeDir, ".claude.json"), "utf8"));
    expect(raw.theme).toBe("dark");
    expect(Object.keys(raw.mcpServers).sort()).toEqual(["extra", "keep"]);
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
    const raw = JSON.parse(readFileSync(path, "utf8"));
    expect(raw.mcpServers.remote).toEqual({ serverUrl: "https://example.com/sse" });
  });

  it("writes the opencode dialect shape", () => {
    const dirs = fixtureDirs();

    addMcpServer(
      getHarness("opencode"),
      { name: "srv", transport: "stdio", command: "bun", args: ["x", "srv"], env: { K: "v" } },
      "project",
      dirs,
    );

    const raw = JSON.parse(readFileSync(join(dirs.projectRoot, "opencode.json"), "utf8"));
    expect(raw.mcp.srv).toEqual({
      type: "local",
      command: ["bun", "x", "srv"],
      environment: { K: "v" },
    });
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

  it("withdraws master-owned servers when a harness is excluded after a sync", () => {
    const dirs = fixtureDirs();
    const previousXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      const masterBody = (excludes: string[]) =>
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
