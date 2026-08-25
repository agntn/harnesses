import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getAllClients,
  getClient,
  listClients,
  resolvePathTemplate,
  detectClient,
  detectClientFromEnv,
  detectProjectClients,
  clientIds,
  version,
  Client,
} from "../src/index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aixa", () => {
  it("should export version", () => {
    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("should expose stable client ids", () => {
    expect([...clientIds].sort()).toEqual([
      "claude",
      "codex",
      "cursor",
      "gemini",
      "github-copilot",
      "mastracode",
      "opencode",
    ]);
    expect(listClients().sort()).toEqual([...clientIds].sort());
  });

  it("should return Client instance for a known client", () => {
    const codex = getClient("codex");

    expect(codex).toBeInstanceOf(Client);
    expect(codex.binaries).toContain("codex");
    expect(codex.config.some((entry) => entry.level === "official")).toBe(true);
    expect(codex.sessions.length).toBeGreaterThan(0);
  });

  it("should return all supported clients", () => {
    const all = getAllClients();

    expect(all).toHaveLength(clientIds.length);
    expect(all.every((client) => client instanceof Client)).toBe(true);
    const cliClients = all.filter((c) => c.id !== "github-copilot");
    expect(cliClients.every((client) => client.binaries.length > 0)).toBe(true);
  });

  it("should instantiate a concrete subclass for every client", () => {
    expect(getAllClients().every((client) => client.constructor !== Client)).toBe(true);
  });

  it("should resolve template placeholders", () => {
    const resolved = resolvePathTemplate("${HOME}/x/${PROJECT_ROOT}", {
      homeDir: "/tmp/home",
      projectRoot: "/repo/project",
    });

    expect(resolved).toBe("/tmp/home/x//repo/project");
  });

  it("should resolve client config and session paths", () => {
    const claude = getClient("claude");
    const resolved = claude.resolve({
      homeDir: "/home/test",
      projectRoot: "/work/repo",
      platform: "linux",
    });

    expect(resolved.config.some((entry) => entry.path.startsWith("/home/test"))).toBe(true);
    expect(resolved.sessions.length).toBeGreaterThan(0);
  });

  it("should resolve %ENVVAR% placeholders", () => {
    vi.stubEnv("AIXA_TEST_DIR", "/test/appdata");

    const resolved = resolvePathTemplate("%AIXA_TEST_DIR%/opencode/config.json");
    expect(resolved).toBe("/test/appdata/opencode/config.json");
  });

  it("should leave unresolvable %ENVVAR% as-is", () => {
    const resolved = resolvePathTemplate("%AIXA_NONEXISTENT_VAR%/config.json");
    expect(resolved).toBe("%AIXA_NONEXISTENT_VAR%/config.json");
  });

  it("should use uniform xdg paths for opencode across platforms", () => {
    const opencode = getClient("opencode");
    const darwin = opencode.resolve({
      homeDir: "/Users/test",
      platform: "darwin",
    });

    expect(darwin.config.some((e) => e.path.includes(".config/opencode"))).toBe(true);
    expect(darwin.sessions.some((e) => e.path.includes(".local/share/opencode"))).toBe(true);

    const win = opencode.resolve({
      homeDir: "C:\\Users\\test",
      platform: "win32",
    });

    expect(win.config.some((e) => e.path.includes(".config/opencode"))).toBe(true);
    expect(win.sessions.some((e) => e.path.includes(".local/share/opencode"))).toBe(true);
  });

  it("should include cross-platform paths regardless of platform filter", () => {
    const claude = getClient("claude");
    const resolved = claude.resolve({
      homeDir: "C:\\Users\\test",
      platform: "win32",
    });

    expect(resolved.config.length).toBeGreaterThan(0);
    expect(resolved.sessions.length).toBeGreaterThan(0);
  });

  it("should filter codex system paths to linux and darwin only", () => {
    const codex = getClient("codex");
    const win = codex.resolve({
      homeDir: "C:\\Users\\test",
      platform: "win32",
    });
    const linux = codex.resolve({
      homeDir: "/home/test",
      platform: "linux",
    });

    expect(win.config.every((e) => !e.path.startsWith("/etc/"))).toBe(true);
    expect(linux.config.some((e) => e.path.startsWith("/etc/"))).toBe(true);
  });

  it("should reject inherited property names as platforms", () => {
    const codex = getClient("codex");

    expect(() => Reflect.apply(codex.resolve, codex, [{ platform: "toString" }])).toThrow(
      "Unsupported platform: toString",
    );
  });

  it("should return platform-specific gemini system paths", () => {
    const gemini = getClient("gemini");
    const linux = gemini.resolve({ homeDir: "/home/test", platform: "linux" });
    const darwin = gemini.resolve({ homeDir: "/Users/test", platform: "darwin" });

    expect(linux.config.some((e) => e.path.startsWith("/etc/gemini-cli/"))).toBe(true);
    expect(linux.config.every((e) => !e.path.includes("Library"))).toBe(true);

    expect(
      darwin.config.some((e) => e.path.includes("Library/Application Support/GeminiCli")),
    ).toBe(true);
    expect(darwin.config.every((e) => !e.path.startsWith("/etc/"))).toBe(true);
  });

  it("should expose platforms field in raw metadata", () => {
    const codex = getClient("codex");

    const unixOnly = codex.config.filter(
      (e) => e.platforms?.includes("linux") && e.platforms?.includes("darwin"),
    );
    const crossPlatform = codex.config.filter((e) => !e.platforms);

    expect(unixOnly.length).toBeGreaterThan(0);
    expect(crossPlatform.length).toBeGreaterThan(0);
  });

  it("should have instructions for each client", () => {
    const all = getAllClients();
    for (const client of all) {
      expect(client.instructions.length).toBeGreaterThan(0);
      expect(client.instructions.every((i) => i.level !== undefined)).toBe(true);
    }
  });

  it("should have skills or commands for each client", () => {
    const all = getAllClients();
    for (const client of all) {
      const hasSkillsOrCommands = client.skills.length > 0 || client.commands.length > 0;
      expect(hasSkillsOrCommands).toBe(true);
    }
  });

  it("should resolve skills paths", () => {
    const claude = getClient("claude");
    const resolved = claude.resolve({
      homeDir: "/home/test",
      platform: "linux",
    });

    expect(resolved.skills.length).toBeGreaterThan(0);
    expect(resolved.skills.some((sk) => sk.path.includes(".claude/skills/"))).toBe(true);
  });

  it("should have capabilities for each client", () => {
    const all = getAllClients();
    for (const client of all) {
      expect(typeof client.capabilities.mcp).toBe("boolean");
      expect(typeof client.capabilities.vision).toBe("boolean");
      expect(typeof client.capabilities.tools).toBe("boolean");
      expect(typeof client.capabilities.streaming).toBe("boolean");
    }
  });

  it("should resolve instructions alongside config and sessions", () => {
    const codex = getClient("codex");
    const resolved = codex.resolve({
      homeDir: "/home/test",
      platform: "linux",
    });

    expect(resolved.instructions.length).toBeGreaterThan(0);
    expect(resolved.instructions.some((i) => i.path === "AGENTS.md")).toBe(true);
  });

  it("should check client installation without throwing", () => {
    const client = getClient("codex");
    expect(typeof client.isInstalled()).toBe("boolean");
  });

  it("should expose detected version without throwing", () => {
    const client = getClient("codex");
    const v = client.version;
    expect(v === null || typeof v === "string").toBe(true);
  });

  it("should detect client from env vars", () => {
    vi.stubEnv("CLAUDE_CODE", "1");
    const client = detectClientFromEnv();
    expect(client).toBeInstanceOf(Client);
    expect(client!.id).toBe("claude");
  });

  it("should return null when no env vars match", () => {
    // Clear all known detection env vars to ensure clean state
    for (const client of getAllClients()) {
      for (const v of client.detection.envVars) {
        vi.stubEnv(v, "");
      }
    }
    expect(detectClientFromEnv()).toBeNull();
  });

  it("should have detection config for all clients", () => {
    const all = getAllClients();
    for (const client of all) {
      expect(client.detection).toBeDefined();
      expect(Array.isArray(client.detection.envVars)).toBe(true);
      expect(Array.isArray(client.detection.projectMarkers)).toBe(true);
    }
  });

  it("should detect cursor from env vars", () => {
    // Clear Claude env vars first (we might be running inside Claude Code)
    for (const v of getClient("claude").detection.envVars) {
      vi.stubEnv(v, "");
    }
    vi.stubEnv("CURSOR_SESSION", "abc123");
    const client = detectClientFromEnv();
    expect(client).toBeInstanceOf(Client);
    expect(client!.id).toBe("cursor");
  });

  it("should have skills for cursor and github-copilot", () => {
    const cursor = getClient("cursor");
    expect(cursor.skills.length).toBeGreaterThan(0);
    expect(cursor.skills.some((s) => s.path.includes(".cursor/skills/"))).toBe(true);

    const copilot = getClient("github-copilot");
    expect(copilot.skills.length).toBeGreaterThan(0);
    expect(copilot.skills.some((s) => s.path.includes(".github/skills/"))).toBe(true);
  });

  it("should have cross-compat skill dirs for cursor", () => {
    const cursor = getClient("cursor");
    expect(cursor.skills.some((s) => s.path.includes(".claude/skills/"))).toBe(true);
    expect(cursor.skills.some((s) => s.path.includes(".codex/skills/"))).toBe(true);
  });

  it("should detect project clients from markers", () => {
    const results = detectProjectClients("/nonexistent/path/that/has/no/markers");
    expect(Array.isArray(results)).toBe(true);
  });

  it("should return null from detectClient when no agent matches", () => {
    // Clear all detection env vars
    for (const client of getAllClients()) {
      for (const v of client.detection.envVars) {
        vi.stubEnv(v, "");
      }
    }
    const result = detectClient("/nonexistent/path/that/has/no/markers");
    expect(result).toBeNull();
  });
});
