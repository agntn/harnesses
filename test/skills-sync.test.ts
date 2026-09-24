import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAllHarnesses, getHarness, syncSkills } from "../src/index.ts";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(): { root: string; homeDir: string; sourceDir: string; backupDir: string } {
  const root = mkdtempSync(join(tmpdir(), "harnesses-skills-"));
  temporaryRoots.push(root);
  const homeDir = join(root, "home");
  const dataDir = join(homeDir, ".local", "share", "agntn");
  return {
    root,
    homeDir,
    sourceDir: join(dataDir, "skills"),
    backupDir: join(dataDir, "diverged", "skills"),
  };
}

function writeSkill(directory: string, name: string, body = `# ${name}\n`): void {
  mkdirSync(join(directory, name), { recursive: true });
  writeFileSync(join(directory, name, "SKILL.md"), body);
}

function withoutXdgData<T>(body: () => T): T {
  const previous = process.env.XDG_DATA_HOME;
  delete process.env.XDG_DATA_HOME;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = previous;
  }
}

describe("syncSkills", () => {
  it("links the skills directory to the canonical source", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeSkill(sourceDir, "review");
      mkdirSync(join(sourceDir, "notes"));
      writeFileSync(join(sourceDir, "README.md"), "not a skill\n");
      const piDir = join(homeDir, ".pi", "agent", "skills");

      const first = syncSkills([getHarness("pi")], false, { homeDir, platform: "linux" });
      expect(first).toEqual({
        source: sourceDir,
        check: false,
        skills: ["review"],
        targets: [{ id: "pi", path: piDir, action: "linked", detail: undefined }],
      });
      expect(readlinkSync(piDir)).toBe(sourceDir);
      expect(readFileSync(join(piDir, "review", "SKILL.md"), "utf8")).toBe("# review\n");

      const second = syncSkills([getHarness("pi")], false, { homeDir, platform: "linux" });
      expect(second.targets).toEqual([{ id: "pi", path: piDir, action: "unchanged" }]);
    });
  });

  it("creates a missing source outside check mode", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();

      const check = syncSkills([getHarness("claude")], true, { homeDir, platform: "linux" });
      expect(check.skills).toEqual([]);
      expect(existsSync(sourceDir)).toBe(false);

      syncSkills([getHarness("claude")], false, { homeDir, platform: "linux" });
      expect(readlinkSync(join(homeDir, ".claude", "skills"))).toBe(sourceDir);
    });
  });

  it("replaces links to single skills in the source without a backup", () => {
    withoutXdgData(() => {
      const { root, homeDir, sourceDir, backupDir } = fixture();
      // The source is itself a link, and the old links to single skills use its real path.
      const realSkills = join(root, "dotfiles", "skills");
      writeSkill(realSkills, "review");
      mkdirSync(join(sourceDir, ".."), { recursive: true });
      symlinkSync(realSkills, sourceDir);
      const codexDir = join(homeDir, ".agents", "skills");
      mkdirSync(codexDir, { recursive: true });
      symlinkSync(join(realSkills, "review"), join(codexDir, "review"));

      const report = syncSkills([getHarness("codex")], false, { homeDir, platform: "linux" });
      expect(report.skills).toEqual(["review"]);
      expect(report.targets[0]).toMatchObject({ action: "relinked", detail: undefined });
      expect(readlinkSync(codexDir)).toBe(sourceDir);
      expect(existsSync(backupDir)).toBe(false);
    });
  });

  it("backs up local skills before linking and writes nothing in check mode", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir, backupDir } = fixture();
      writeSkill(sourceDir, "review");
      const claudeDir = join(homeDir, ".claude", "skills");
      writeSkill(claudeDir, "local-only", "# kept\n");

      const check = syncSkills([getHarness("claude")], true, { homeDir, platform: "linux" });
      expect(check.targets[0]).toMatchObject({
        action: "adopted",
        detail: "check mode: not applied",
      });
      expect(lstatSync(claudeDir).isDirectory()).toBe(true);
      expect(existsSync(backupDir)).toBe(false);

      const applied = syncSkills([getHarness("claude")], false, { homeDir, platform: "linux" });
      const backup = applied.targets[0]?.detail;
      expect(applied.targets[0]?.action).toBe("adopted");
      expect(backup?.startsWith(join(backupDir, "claude", "skills-"))).toBe(true);
      expect(readFileSync(join(backup ?? "", "local-only", "SKILL.md"), "utf8")).toBe("# kept\n");
      expect(readlinkSync(claudeDir)).toBe(sourceDir);
    });
  });

  it("relinks a link to another directory and keeps the old target in the backup", () => {
    withoutXdgData(() => {
      const { root, homeDir, sourceDir, backupDir } = fixture();
      writeSkill(sourceDir, "review");
      const elsewhere = join(root, "elsewhere");
      writeSkill(elsewhere, "old");
      const geminiDir = join(homeDir, ".gemini", "skills");
      mkdirSync(join(geminiDir, ".."), { recursive: true });
      symlinkSync(elsewhere, geminiDir);

      const report = syncSkills([getHarness("gemini")], false, { homeDir, platform: "linux" });
      const backup = report.targets[0]?.detail ?? "";
      expect(report.targets[0]?.action).toBe("relinked");
      expect(readlinkSync(backup)).toBe(elsewhere);
      expect(readdirSync(join(backupDir, "gemini"))).toHaveLength(1);
      expect(readlinkSync(geminiDir)).toBe(sourceDir);
      expect(existsSync(join(elsewhere, "old", "SKILL.md"))).toBe(true);
    });
  });

  it("leaves a destination alone when the source links into it", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir, backupDir } = fixture();
      const piDir = join(homeDir, ".pi", "agent", "skills");
      writeSkill(piDir, "review");
      mkdirSync(join(sourceDir, ".."), { recursive: true });
      symlinkSync(piDir, sourceDir);

      const report = syncSkills([getHarness("pi")], false, { homeDir, platform: "linux" });
      expect(report.skills).toEqual(["review"]);
      expect(report.targets[0]).toEqual({
        id: "pi",
        path: piDir,
        action: "skipped",
        detail: "destination holds the source directory",
      });
      expect(lstatSync(piDir).isDirectory()).toBe(true);
      expect(existsSync(join(piDir, "review", "SKILL.md"))).toBe(true);
      expect(existsSync(backupDir)).toBe(false);
    });
  });

  it("leaves a destination link alone when the source links through it", () => {
    withoutXdgData(() => {
      const { root, homeDir, sourceDir } = fixture();
      const realSkills = join(root, "dotfiles", "skills");
      writeSkill(realSkills, "review");
      const claudeDir = join(homeDir, ".claude", "skills");
      mkdirSync(join(claudeDir, ".."), { recursive: true });
      symlinkSync(realSkills, claudeDir);
      mkdirSync(join(sourceDir, ".."), { recursive: true });
      symlinkSync(claudeDir, sourceDir);

      const report = syncSkills([getHarness("claude")], false, { homeDir, platform: "linux" });
      expect(report.targets[0]).toMatchObject({
        action: "skipped",
        detail: "destination holds the source directory",
      });
      expect(readlinkSync(claudeDir)).toBe(realSkills);
      expect(existsSync(join(sourceDir, "review", "SKILL.md"))).toBe(true);
    });
  });

  it("skips harnesses without a user-scope skills directory", () => {
    withoutXdgData(() => {
      const { homeDir } = fixture();
      const report = syncSkills([getHarness("github-copilot")], false, {
        homeDir,
        platform: "linux",
      });
      expect(report.targets).toEqual([
        {
          id: "github-copilot",
          action: "skipped",
          detail: "no stable user-scope skills directory",
        },
      ]);
    });
  });
});

describe("skillsSyncTarget", () => {
  it("points at a user-scope skills directory the harness reads", () => {
    for (const harness of getAllHarnesses()) {
      const target = harness.skillsSyncTarget;
      if (target === null) continue;
      expect(
        harness.skills.some((skill) => skill.path === target.path && skill.scope === "user"),
        harness.id,
      ).toBe(true);
    }
  });

  it("gives every harness its own destination", () => {
    const paths = getAllHarnesses()
      .map((harness) => harness.skillsSyncTarget?.path)
      .filter((path) => path !== undefined);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("resolves the destination with the other paths", () => {
    const paths = getHarness("opencode").resolve({ homeDir: "/home/fixture", platform: "linux" });
    expect(paths.skillsSyncTarget?.path).toBe("/home/fixture/.config/opencode/skills/");
  });
});
