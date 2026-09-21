import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";
import { getHarness, syncPromptTemplates } from "../src/index.ts";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function fixture(): { homeDir: string; sourceDir: string } {
  const root = temporaryRoot("harnesses-prompts-");
  const homeDir = join(root, "home");
  const sourceDir = join(homeDir, ".local", "share", "agntn", "prompts");
  mkdirSync(sourceDir, { recursive: true });
  return { homeDir, sourceDir };
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

describe("syncPromptTemplates", () => {
  it("links canonical Markdown and generates Gemini TOML", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      const source = join(sourceDir, "review.md");
      writeFileSync(
        source,
        "---\ndescription: Review the current change\nargument-hint: path\n---\nReview $ARGUMENTS carefully.\n",
      );

      const first = syncPromptTemplates([getHarness("pi"), getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      const piPath = join(homeDir, ".pi", "agent", "prompts", "review.md");
      const geminiPath = join(homeDir, ".gemini", "commands", "review.toml");

      expect(first.source).toBe(sourceDir);
      expect(first.templates).toEqual(["review"]);
      expect(first.targets[0]?.templates[0]?.action).toBe("linked");
      expect(first.targets[1]?.templates[0]?.action).toBe("generated");
      expect(lstatSync(piPath).isSymbolicLink()).toBe(true);
      expect(readlinkSync(piPath)).toBe(source);
      expect(parseToml(readFileSync(geminiPath, "utf8"))).toEqual({
        description: "Review the current change",
        prompt: "Review {{args}} carefully.\n",
      });

      const second = syncPromptTemplates([getHarness("pi"), getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      expect(second.targets.map((target) => target.templates[0]?.action)).toEqual([
        "unchanged",
        "unchanged",
      ]);

      writeFileSync(
        source,
        "---\ndescription: Review the update\n---\nInspect $ARGUMENTS again.\n",
      );
      const third = syncPromptTemplates([getHarness("pi"), getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      expect(third.targets.map((target) => target.templates[0]?.action)).toEqual([
        "unchanged",
        "replaced",
      ]);
      const replaced = third.targets[1]?.templates[0];
      if (replaced?.detail === undefined) {
        throw new Error("Missing backup for replaced Gemini template");
      }
      expect(parseToml(readFileSync(replaced.detail, "utf8"))).toEqual({
        description: "Review the current change",
        prompt: "Review {{args}} carefully.\n",
      });
      expect(parseToml(readFileSync(geminiPath, "utf8"))).toEqual({
        description: "Review the update",
        prompt: "Inspect {{args}} again.\n",
      });
    });
  });

  it("reports check mode, backs up collisions, and removes only managed stale files", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      const source = join(sourceDir, "review.md");
      writeFileSync(source, "Review $ARGUMENTS.\n");
      const targetDir = join(homeDir, ".pi", "agent", "prompts");
      mkdirSync(targetDir, { recursive: true });
      const target = join(targetDir, "review.md");
      const stale = join(targetDir, "gone.md");
      const personal = join(targetDir, "personal.md");
      writeFileSync(target, "local version\n");
      symlinkSync(join(sourceDir, "gone.md"), stale);
      writeFileSync(personal, "leave me alone\n");

      const check = syncPromptTemplates([getHarness("pi")], true, {
        homeDir,
        platform: "linux",
      });
      expect(check.targets[0]?.templates.map(({ action }) => action)).toEqual([
        "adopted",
        "removed",
      ]);
      expect(readFileSync(target, "utf8")).toBe("local version\n");
      expect(existsSync(stale)).toBe(false);
      expect(lstatSync(stale).isSymbolicLink()).toBe(true);

      const applied = syncPromptTemplates([getHarness("pi")], false, {
        homeDir,
        platform: "linux",
      });
      const adopted = applied.targets[0]?.templates.find((result) => result.action === "adopted");
      if (adopted?.detail === undefined) throw new Error("Missing backup for adopted template");
      expect(readFileSync(adopted.detail, "utf8")).toBe("local version\n");
      expect(readlinkSync(target)).toBe(source);
      expect(existsSync(stale)).toBe(false);
      expect(readFileSync(personal, "utf8")).toBe("leave me alone\n");
    });
  });

  it("preserves the referent when backing up a relative Gemini symlink", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "review.md"), "Review this.\n");
      const customDir = join(homeDir, ".gemini", "custom");
      const targetDir = join(homeDir, ".gemini", "commands");
      const custom = join(customDir, "review.toml");
      const target = join(targetDir, "review.toml");
      mkdirSync(customDir, { recursive: true });
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(custom, 'prompt = "local"\n');
      symlinkSync("../custom/review.toml", target);

      const report = syncPromptTemplates([getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      const adopted = report.targets[0]?.templates[0];
      if (adopted?.detail === undefined) throw new Error("Missing backup for adopted template");
      const backupTarget = readlinkSync(adopted.detail);

      expect(resolve(dirname(adopted.detail), backupTarget)).toBe(custom);
      expect(readFileSync(adopted.detail, "utf8")).toBe('prompt = "local"\n');
    });
  });

  it("uses XDG_DATA_HOME for canonical prompts and divergence backups", () => {
    const previous = process.env.XDG_DATA_HOME;
    const root = temporaryRoot("harnesses-prompts-xdg-");
    const homeDir = join(root, "home");
    const xdgData = join(root, "data");
    const sourceDir = join(xdgData, "agntn", "prompts");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "review.md"), "Review this.\\n");
    const targetDir = join(homeDir, ".pi", "agent", "prompts");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "review.md"), "local version\\n");
    process.env.XDG_DATA_HOME = xdgData;

    try {
      const report = syncPromptTemplates([getHarness("pi")], false, {
        homeDir,
        platform: "linux",
      });
      const adopted = report.targets[0]?.templates[0];
      expect(report.source).toBe(sourceDir);
      expect(adopted?.action).toBe("adopted");
      expect(adopted?.detail).toContain(join(xdgData, "agntn", "diverged", "prompts", "pi"));
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previous;
    }
  });

  it("encodes XDG paths safely in Gemini ownership markers", () => {
    const previous = process.env.XDG_DATA_HOME;
    const root = temporaryRoot("harnesses-prompts-marker-");
    const homeDir = join(root, "home");
    const xdgData = join(root, "data\nhome");
    const sourceDir = join(xdgData, "agntn", "prompts");
    const source = join(sourceDir, "review.md");
    const target = join(homeDir, ".gemini", "commands", "review.toml");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(source, "Review this.\n");
    process.env.XDG_DATA_HOME = xdgData;

    try {
      syncPromptTemplates([getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      expect(parseToml(readFileSync(target, "utf8"))).toMatchObject({
        prompt: "Review this.\n",
      });

      unlinkSync(source);
      const report = syncPromptTemplates([getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      expect(report.targets[0]?.templates[0]?.action).toBe("removed");
      expect(existsSync(target)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previous;
    }
  });

  it("validates Gemini conversion before writing any target", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "broken.md"), "---\ndescription:\n  - nope\n---\nPrompt.\n");

      expect(() =>
        syncPromptTemplates([getHarness("pi"), getHarness("gemini")], false, {
          homeDir,
          platform: "linux",
        }),
      ).toThrow(/description is not a string/);
      expect(existsSync(join(homeDir, ".pi", "agent", "prompts", "broken.md"))).toBe(false);
    });
  });

  it("rejects filenames that are not portable command names", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "bad name.md"), "Prompt.\n");

      expect(() =>
        syncPromptTemplates([getHarness("pi")], false, {
          homeDir,
          platform: "linux",
        }),
      ).toThrow(/Invalid prompt template filename: bad name\.md/);
      expect(existsSync(join(homeDir, ".pi", "agent", "prompts"))).toBe(false);
    });
  });

  it("reports harnesses without a stable destination", () => {
    withoutXdgData(() => {
      const { homeDir } = fixture();
      const report = syncPromptTemplates([getHarness("github-copilot")], false, {
        homeDir,
        platform: "linux",
      });

      expect(report.targets).toEqual([
        {
          id: "github-copilot",
          detail: "no stable user-scope prompt template destination",
          templates: [],
        },
      ]);
    });
  });
});
