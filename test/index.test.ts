import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getAllHarnesses,
  getHarness,
  listHarnesses,
  resolvePathTemplate,
  detectHarness,
  detectHarnessFromEnv,
  detectProjectHarnesses,
  harnessIds,
  version,
  Harness,
} from "../src/index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("@agntn/harnesses", () => {
  it("should export version", () => {
    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("should expose stable harness ids", () => {
    expect([...harnessIds].sort()).toEqual([
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "freebuff",
      "gemini",
      "github-copilot",
      "grok",
      "mastracode",
      "omp",
      "opencode",
      "pi",
    ]);
    expect(listHarnesses().sort()).toEqual([...harnessIds].sort());
  });

  it("should expose Antigravity CLI metadata", () => {
    const antigravity = getHarness("antigravity");

    expect(antigravity.binaries).toEqual(["agy"]);
    expect(antigravity.invocation?.args).toEqual(["--print", "{prompt}"]);
    expect(antigravity.invocation?.jsonArgs).toEqual([
      "--print",
      "--output-format",
      "json",
      "{prompt}",
    ]);
    expect(
      antigravity.mcpConfigs.some((entry) => entry.path === "~/.gemini/config/mcp_config.json"),
    ).toBe(true);
  });

  it("should return a Harness instance for a known harness", () => {
    const codex = getHarness("codex");

    expect(codex).toBeInstanceOf(Harness);
    expect(codex.binaries).toContain("codex");
    expect(codex.config.some((entry) => entry.level === "official")).toBe(true);
    expect(codex.sessions.length).toBeGreaterThan(0);
  });

  it("should return all supported harnesses", () => {
    const all = getAllHarnesses();

    expect(all).toHaveLength(harnessIds.length);
    expect(all.every((harness) => harness instanceof Harness)).toBe(true);
    expect(all.every((harness) => harness.binaries.length > 0)).toBe(true);
  });

  it("should instantiate a concrete subclass for every harness", () => {
    expect(getAllHarnesses().every((harness) => harness.constructor !== Harness)).toBe(true);
  });

  it("should resolve template placeholders", () => {
    const resolved = resolvePathTemplate("${HOME}/x/${PROJECT_ROOT}", {
      homeDir: "/tmp/home",
      projectRoot: "/repo/project",
    });

    expect(resolved).toBe("/tmp/home/x//repo/project");
  });

  it("should resolve harness config and session paths", () => {
    const claude = getHarness("claude");
    const resolved = claude.resolve({
      homeDir: "/home/test",
      projectRoot: "/work/repo",
      platform: "linux",
    });

    expect(resolved.config.some((entry) => entry.path.startsWith("/home/test"))).toBe(true);
    expect(resolved.sessions.length).toBeGreaterThan(0);
  });

  it("should resolve Claude transcripts under encoded project directories", () => {
    const claude = getHarness("claude");
    const resolved = claude.resolve({ homeDir: "/home/test", platform: "linux" });

    expect(resolved.sessions[0]?.path).toBe(
      "/home/test/.claude/projects/<dash-encoded-cwd>/*.jsonl",
    );
  });

  it("should resolve %ENVVAR% placeholders", () => {
    vi.stubEnv("HARNESSES_TEST_DIR", "/test/appdata");

    const resolved = resolvePathTemplate("%HARNESSES_TEST_DIR%/opencode/config.json");
    expect(resolved).toBe("/test/appdata/opencode/config.json");
  });

  it("should leave unresolvable %ENVVAR% as-is", () => {
    const resolved = resolvePathTemplate("%HARNESSES_NONEXISTENT_VAR%/config.json");
    expect(resolved).toBe("%HARNESSES_NONEXISTENT_VAR%/config.json");
  });

  it("should use uniform xdg paths for opencode across platforms", () => {
    const opencode = getHarness("opencode");
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
    const claude = getHarness("claude");
    const resolved = claude.resolve({
      homeDir: "C:\\Users\\test",
      platform: "win32",
    });

    expect(resolved.config.length).toBeGreaterThan(0);
    expect(resolved.sessions.length).toBeGreaterThan(0);
  });

  it("should filter codex system paths to linux and darwin only", () => {
    const codex = getHarness("codex");
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
    const codex = getHarness("codex");

    expect(() => codex.resolve({ platform: "toString" as never })).toThrow(
      "Unsupported platform: toString",
    );
  });

  it("should return platform-specific gemini system paths", () => {
    const gemini = getHarness("gemini");
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
    const codex = getHarness("codex");

    const unixOnly = codex.config.filter(
      (e) => e.platforms?.includes("linux") && e.platforms?.includes("darwin"),
    );
    const crossPlatform = codex.config.filter((e) => !e.platforms);

    expect(unixOnly.length).toBeGreaterThan(0);
    expect(crossPlatform.length).toBeGreaterThan(0);
  });

  it("should have instructions for each harness", () => {
    const all = getAllHarnesses();
    for (const harness of all) {
      expect(harness.instructions.length).toBeGreaterThan(0);
      expect(harness.instructions.every((i) => i.level !== undefined)).toBe(true);
    }
  });

  it("should have skills or commands for each harness", () => {
    const all = getAllHarnesses();
    for (const harness of all) {
      const hasSkillsOrCommands = harness.skills.length > 0 || harness.commands.length > 0;
      expect(hasSkillsOrCommands).toBe(true);
    }
  });

  it("should resolve skills paths", () => {
    const claude = getHarness("claude");
    const resolved = claude.resolve({
      homeDir: "/home/test",
      platform: "linux",
    });

    expect(resolved.skills.length).toBeGreaterThan(0);
    expect(resolved.skills.some((sk) => sk.path.includes(".claude/skills/"))).toBe(true);
  });

  it("should have capabilities for each harness", () => {
    const all = getAllHarnesses();
    for (const harness of all) {
      expect(typeof harness.capabilities.mcp).toBe("boolean");
      expect(typeof harness.capabilities.vision).toBe("boolean");
      expect(typeof harness.capabilities.audio).toBe("boolean");
      expect(typeof harness.capabilities.video).toBe("boolean");
      expect(typeof harness.capabilities.tools).toBe("boolean");
      expect(typeof harness.capabilities.streaming).toBe("boolean");
    }
  });

  it("should expose verified native audio and video support", () => {
    const mediaCapabilities = Object.fromEntries(
      getAllHarnesses().map((harness) => [
        harness.id,
        { audio: harness.capabilities.audio, video: harness.capabilities.video },
      ]),
    );

    expect(mediaCapabilities).toEqual({
      antigravity: { audio: true, video: true },
      claude: { audio: false, video: false },
      codex: { audio: false, video: false },
      cursor: { audio: false, video: false },
      freebuff: { audio: false, video: false },
      gemini: { audio: true, video: false },
      "github-copilot": { audio: false, video: false },
      grok: { audio: false, video: false },
      mastracode: { audio: false, video: false },
      omp: { audio: false, video: false },
      opencode: { audio: false, video: false },
      pi: { audio: false, video: false },
    });
  });

  it("should resolve instructions alongside config and sessions", () => {
    const codex = getHarness("codex");
    const resolved = codex.resolve({
      homeDir: "/home/test",
      platform: "linux",
    });

    expect(resolved.instructions.length).toBeGreaterThan(0);
    expect(resolved.instructions.some((i) => i.path === "AGENTS.md")).toBe(true);
  });

  it("should check harness installation without throwing", () => {
    const harness = getHarness("codex");
    expect(typeof harness.isInstalled()).toBe("boolean");
  });

  it("should expose detected version without throwing", () => {
    const harness = getHarness("codex");
    const v = harness.version;
    expect(v === null || typeof v === "string").toBe(true);
  });

  it("should detect a harness from env vars", () => {
    vi.stubEnv("CLAUDE_CODE", "1");
    const harness = detectHarnessFromEnv();
    expect(harness).toBeInstanceOf(Harness);
    expect(harness!.id).toBe("claude");
  });

  it("should return null when no env vars match", () => {
    // Clear all known detection env vars to ensure clean state
    for (const harness of getAllHarnesses()) {
      for (const v of harness.detection.envVars) {
        vi.stubEnv(v, "");
      }
    }
    expect(detectHarnessFromEnv()).toBeNull();
  });

  it("should have detection config for all harnesses", () => {
    const all = getAllHarnesses();
    for (const harness of all) {
      expect(harness.detection).toBeDefined();
      expect(Array.isArray(harness.detection.envVars)).toBe(true);
      expect(Array.isArray(harness.detection.projectMarkers)).toBe(true);
    }
  });

  it("should detect cursor from env vars", () => {
    // Clear Claude env vars first (we might be running inside Claude Code)
    for (const v of getHarness("claude").detection.envVars) {
      vi.stubEnv(v, "");
    }
    vi.stubEnv("CURSOR_SESSION", "abc123");
    const harness = detectHarnessFromEnv();
    expect(harness).toBeInstanceOf(Harness);
    expect(harness!.id).toBe("cursor");
  });

  it("should have skills for cursor and github-copilot", () => {
    const cursor = getHarness("cursor");
    expect(cursor.skills.length).toBeGreaterThan(0);
    expect(cursor.skills.some((s) => s.path.includes(".cursor/skills/"))).toBe(true);

    const copilot = getHarness("github-copilot");
    expect(copilot.skills.length).toBeGreaterThan(0);
    expect(copilot.skills.some((s) => s.path.includes(".github/skills/"))).toBe(true);
  });

  it("should have cross-compat skill dirs for cursor", () => {
    const cursor = getHarness("cursor");
    expect(cursor.skills.some((s) => s.path.includes(".claude/skills/"))).toBe(true);
    expect(cursor.skills.some((s) => s.path.includes(".codex/skills/"))).toBe(true);
  });

  it("should detect project harnesses from markers", () => {
    const results = detectProjectHarnesses("/nonexistent/path/that/has/no/markers");
    expect(Array.isArray(results)).toBe(true);
  });

  it("should return null from detectHarness when no agent matches", () => {
    // Clear all detection env vars
    for (const harness of getAllHarnesses()) {
      for (const v of harness.detection.envVars) {
        vi.stubEnv(v, "");
      }
    }
    const result = detectHarness("/nonexistent/path/that/has/no/markers");
    expect(result).toBeNull();
  });
});
