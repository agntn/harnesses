import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { getHarness, syncAgentsFiles } from "../src/index.ts";

function fixture(): { homeDir: string } {
  const root = mkdtempSync(join(tmpdir(), "harnesses-agents-"));
  const homeDir = join(root, "home");
  mkdirSync(join(homeDir, ".config", "agntn"), { recursive: true });
  return { homeDir };
}

function withoutXdg<T>(body: () => T): T {
  const previous = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME;
  try {
    return body();
  } finally {
    if (previous !== undefined) process.env.XDG_CONFIG_HOME = previous;
  }
}

type AgentTarget = ReturnType<typeof syncAgentsFiles>["targets"][number];

function requiredTarget(
  targets: ReadonlyMap<string, Readonly<AgentTarget>>,
  id: string,
): Readonly<AgentTarget> {
  const target = targets.get(id);
  if (!target) throw new Error(`Missing sync target: ${id}`);
  return target;
}

function requiredPath(target: Readonly<AgentTarget>): string {
  if (!target.path) throw new Error(`Missing path for sync target: ${target.id}`);
  return target.path;
}

describe("syncAgentsFiles", () => {
  it("links, repairs, adopts, and honors excludes", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      const master = join(homeDir, ".config", "agntn", "AGENTS.md");
      writeFileSync(master, "# master contract\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        `{
  // codex stays self-managed
  "excludes": ["codex"],
}`,
      );

      // claude: missing -> linked; omp: wrong link -> relinked;
      // pi: diverged file -> adopted; gemini: empty file -> relinked
      mkdirSync(join(homeDir, ".omp", "agent"), { recursive: true });
      writeFileSync(join(homeDir, "other.md"), "elsewhere\n");
      symlinkSync(join(homeDir, "other.md"), join(homeDir, ".omp", "agent", "AGENTS.md"));
      mkdirSync(join(homeDir, ".pi", "agent"), { recursive: true });
      writeFileSync(join(homeDir, ".pi", "agent", "AGENTS.md"), "# local drift\n");
      mkdirSync(join(homeDir, ".gemini"), { recursive: true });
      writeFileSync(join(homeDir, ".gemini", "GEMINI.md"), "");

      const targets = ["antigravity", "claude", "codex", "omp", "pi", "gemini", "grok"].map((id) =>
        getHarness(id as never),
      );
      const report = syncAgentsFiles(targets, false, { homeDir });
      const byId = new Map(report.targets.map((t) => [t.id, t]));

      const antigravity = requiredTarget(byId, "antigravity");
      expect(antigravity.action).toBe("linked");
      expect(antigravity.path).toBe(join(homeDir, ".gemini", "config", "AGENTS.md"));
      expect(requiredTarget(byId, "claude").action).toBe("linked");
      expect(requiredTarget(byId, "codex").action).toBe("skipped");
      expect(requiredTarget(byId, "omp").action).toBe("relinked");
      expect(requiredTarget(byId, "pi").action).toBe("adopted");
      expect(requiredTarget(byId, "gemini").action).toBe("relinked");
      expect(requiredTarget(byId, "grok").action).toBe("skipped");

      for (const id of ["antigravity", "claude", "omp", "pi", "gemini"]) {
        const path = requiredPath(requiredTarget(byId, id));
        expect(lstatSync(path).isSymbolicLink()).toBe(true);
        expect(realpathSync(path)).toBe(realpathSync(master));
      }
      const backup = requiredTarget(byId, "pi").detail;
      if (!backup) throw new Error("Missing backup path for adopted Pi instructions");
      expect(readFileSync(backup, "utf8")).toBe("# local drift\n");

      const second = syncAgentsFiles(targets, false, { homeDir });
      for (const t of second.targets) {
        if (t.action !== "skipped") expect(t.action).toBe("unchanged");
      }
    });
  });

  it("relinks a file that bypasses the master interface, and follows master chains", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      const backend = join(homeDir, "backend-AGENTS.md");
      writeFileSync(backend, "# backend contract\n");
      const master = join(homeDir, ".config", "agntn", "AGENTS.md");
      symlinkSync(backend, master);

      // claude linkuje prosto do backendu z pominięciem mastera
      mkdirSync(join(homeDir, ".claude"), { recursive: true });
      symlinkSync(backend, join(homeDir, ".claude", "CLAUDE.md"));

      const report = syncAgentsFiles([getHarness("claude")], false, { homeDir });

      expect(report.targets[0]?.action).toBe("relinked");
      expect(readlinkSync(join(homeDir, ".claude", "CLAUDE.md"))).toBe(master);
      expect(readFileSync(join(homeDir, ".claude", "CLAUDE.md"), "utf8")).toBe(
        "# backend contract\n",
      );

      const second = syncAgentsFiles([getHarness("claude")], false, { homeDir });
      expect(second.targets[0]?.action).toBe("unchanged");
    });
  });

  it("check mode reports without touching the filesystem", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      writeFileSync(join(homeDir, ".config", "agntn", "AGENTS.md"), "# master\n");

      const report = syncAgentsFiles([getHarness("claude")], true, { homeDir });

      expect(report.check).toBe(true);
      expect(report.targets[0]?.action).toBe("linked");
      expect(() => readlinkSync(join(homeDir, ".claude", "CLAUDE.md"))).toThrow();
    });
  });

  it("anchors a relative source to the config directory", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      writeFileSync(join(homeDir, ".config", "agntn", "shared.md"), "# shared\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        JSON.stringify({ source: "shared.md" }),
      );

      const report = syncAgentsFiles([getHarness("claude")], false, { homeDir });

      expect(report.source).toBe(join(homeDir, ".config", "agntn", "shared.md"));
      expect(readlinkSync(join(homeDir, ".claude", "CLAUDE.md"))).toBe(report.source);
    });
  });

  it("links declared companion files beside each harness target", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      const bundleDir = join(homeDir, ".config", "agntn", "bundle");
      mkdirSync(bundleDir);
      const master = join(bundleDir, "AGENTS.md");
      const rules = join(bundleDir, "RULES.md");
      writeFileSync(master, "# master\n");
      writeFileSync(rules, "# rules\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        JSON.stringify({ source: "bundle/AGENTS.md", companions: ["RULES.md"] }),
      );
      mkdirSync(join(homeDir, ".claude"));
      const wrongRules = join(homeDir, "other-rules.md");
      writeFileSync(wrongRules, "# wrong rules\n");
      symlinkSync(wrongRules, join(homeDir, ".claude", "RULES.md"));

      const report = syncAgentsFiles([getHarness("claude")], false, { homeDir });
      const target = report.targets[0];
      if (!target) throw new Error("Missing Claude sync target");

      expect(readlinkSync(join(homeDir, ".claude", "CLAUDE.md"))).toBe(master);
      expect(readlinkSync(join(homeDir, ".claude", "RULES.md"))).toBe(rules);
      expect(target.companions).toEqual([
        {
          source: rules,
          path: join(homeDir, ".claude", "RULES.md"),
          action: "relinked",
        },
      ]);
    });
  });

  it("check mode reports a missing companion without touching the filesystem", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      const master = join(homeDir, ".config", "agntn", "AGENTS.md");
      const rules = join(homeDir, ".config", "agntn", "RULES.md");
      writeFileSync(master, "# master\n");
      writeFileSync(rules, "# rules\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        JSON.stringify({ companions: ["RULES.md"] }),
      );
      mkdirSync(join(homeDir, ".claude"));
      symlinkSync(master, join(homeDir, ".claude", "CLAUDE.md"));

      const report = syncAgentsFiles([getHarness("claude")], true, { homeDir });
      const target = report.targets[0];
      if (!target) throw new Error("Missing Claude sync target");

      expect(target.action).toBe("unchanged");
      expect(target.companions).toEqual([
        {
          source: rules,
          path: join(homeDir, ".claude", "RULES.md"),
          action: "linked",
          detail: "check mode: not applied",
        },
      ]);
      expect(() => readlinkSync(join(homeDir, ".claude", "RULES.md"))).toThrow();
    });
  });

  it("fails clearly when the master file is missing", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      expect(() => syncAgentsFiles([getHarness("claude")], false, { homeDir })).toThrow(
        /No master agents file/,
      );
    });
  });

  it("rejects an invalid source before linking any target", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      writeFileSync(join(homeDir, ".config", "agntn", "AGENTS.md"), "# master\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        JSON.stringify({ source: ["bundle/AGENTS.md"] }),
      );

      expect(() => syncAgentsFiles([getHarness("claude")], false, { homeDir })).toThrow(
        /invalid source/,
      );
      expect(() => lstatSync(join(homeDir, ".claude", "CLAUDE.md"))).toThrow();
    });
  });

  it("preflights companion sources before linking the master", () => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      writeFileSync(join(homeDir, ".config", "agntn", "AGENTS.md"), "# master\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        JSON.stringify({ companions: ["MISSING.md"] }),
      );

      expect(() => syncAgentsFiles([getHarness("claude")], false, { homeDir })).toThrow(
        /No companion agents file/,
      );
      expect(() => readlinkSync(join(homeDir, ".claude", "CLAUDE.md"))).toThrow();
    });
  });

  it.each(["../RULES.md", "..\\RULES.md", "C:RULES.md", "C:\\RULES.md"])(
    "rejects unsafe companion path %s",
    (companion) => {
      withoutXdg(() => {
        const { homeDir } = fixture();
        writeFileSync(join(homeDir, ".config", "agntn", "AGENTS.md"), "# master\n");
        writeFileSync(
          join(homeDir, ".config", "agntn", "agents.jsonc"),
          JSON.stringify({ companions: [companion] }),
        );

        expect(() => syncAgentsFiles([getHarness("claude")], false, { homeDir })).toThrow(
          /unsafe companion path/,
        );
      });
    },
  );

  it.each([
    ["case-only aliases", ["RULES.md", "rules.md"]],
    ["separator aliases", ["bundle/RULES.md", "bundle\\RULES.md"]],
    ["trailing-separator aliases", ["RULES.md", `RULES.md${sep}`]],
  ])("rejects duplicate companion %s", (_label, companions) => {
    withoutXdg(() => {
      const { homeDir } = fixture();
      writeFileSync(join(homeDir, ".config", "agntn", "AGENTS.md"), "# master\n");
      writeFileSync(
        join(homeDir, ".config", "agntn", "agents.jsonc"),
        JSON.stringify({ companions }),
      );

      expect(() => syncAgentsFiles([getHarness("claude")], false, { homeDir })).toThrow(
        /duplicate companion paths/,
      );
    });
  });
});
