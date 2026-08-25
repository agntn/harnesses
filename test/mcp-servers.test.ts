import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addMcpServer, getHarness, listMcpServers, removeMcpServer } from "../src/index.ts";

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
