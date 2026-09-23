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
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHarness, syncPromptTemplates } from "../src/index.ts";

// Rename failures by destination directory, standing in for a mount point.
const renameErrors = vi.hoisted(() => new Map<string, string>());

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    renameSync: (from: string, to: string) => {
      for (const [dir, code] of renameErrors) {
        if (to.startsWith(dir)) {
          throw Object.assign(new Error(`${code}: simulated rename failure`), { code });
        }
      }
      fs.renameSync(from, to);
    },
  };
});

const temporaryRoots: string[] = [];

afterEach(() => {
  renameErrors.clear();
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
  it("links the Markdown destination directory to the canonical source", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "review.md"), "Review $ARGUMENTS carefully.\n");
      const piDir = join(homeDir, ".pi", "agent", "prompts");

      const first = syncPromptTemplates([getHarness("pi")], false, {
        homeDir,
        platform: "linux",
      });
      expect(first.source).toBe(sourceDir);
      expect(first.templates).toEqual(["review"]);
      expect(first.targets).toEqual([
        { id: "pi", path: piDir, format: "markdown", action: "linked", templates: [] },
      ]);
      expect(lstatSync(piDir).isSymbolicLink()).toBe(true);
      expect(readlinkSync(piDir)).toBe(sourceDir);
      expect(readFileSync(join(piDir, "review.md"), "utf8")).toBe("Review $ARGUMENTS carefully.\n");

      const second = syncPromptTemplates([getHarness("pi")], false, {
        homeDir,
        platform: "linux",
      });
      expect(second.targets[0]?.action).toBe("unchanged");
    });
  });

  it("generates Gemini TOML and backs up the previous version after an edit", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      const source = join(sourceDir, "review.md");
      writeFileSync(
        source,
        "---\ndescription: Review the current change\nargument-hint: path\n---\nReview $ARGUMENTS carefully.\n",
      );
      const geminiPath = join(homeDir, ".gemini", "commands", "review.toml");
      const sync = () =>
        syncPromptTemplates([getHarness("gemini")], false, { homeDir, platform: "linux" })
          .targets[0]?.templates[0];

      expect(sync()?.action).toBe("generated");
      expect(parseToml(readFileSync(geminiPath, "utf8"))).toEqual({
        description: "Review the current change",
        prompt: "Review {{args}} carefully.\n",
      });
      expect(sync()?.action).toBe("unchanged");

      writeFileSync(
        source,
        "---\ndescription: Review the update\n---\nInspect $ARGUMENTS again.\n",
      );
      const replaced = sync();
      if (replaced?.detail === undefined) {
        throw new Error("Missing backup for replaced Gemini template");
      }
      expect(replaced.action).toBe("replaced");
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

  it("shares one prompt directory so a harness cannot keep private templates", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "review.md"), "Review $ARGUMENTS.\n");

      syncPromptTemplates([getHarness("pi"), getHarness("claude")], false, {
        homeDir,
        platform: "linux",
      });
      const piDir = join(homeDir, ".pi", "agent", "prompts");
      const claudeDir = join(homeDir, ".claude", "commands");
      writeFileSync(join(piDir, "local.md"), "Written by Pi.\n");

      expect(readlinkSync(piDir)).toBe(sourceDir);
      expect(readlinkSync(claudeDir)).toBe(sourceDir);
      expect(readFileSync(join(sourceDir, "local.md"), "utf8")).toBe("Written by Pi.\n");
      expect(readFileSync(join(claudeDir, "local.md"), "utf8")).toBe("Written by Pi.\n");
    });
  });

  it("replaces per-template links from earlier releases without a backup", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      const source = join(sourceDir, "review.md");
      writeFileSync(source, "Review $ARGUMENTS.\n");
      const targetDir = join(homeDir, ".pi", "agent", "prompts");
      mkdirSync(targetDir, { recursive: true });
      symlinkSync(source, join(targetDir, "review.md"));
      symlinkSync(join(sourceDir, "gone.md"), join(targetDir, "gone.md"));

      const check = syncPromptTemplates([getHarness("pi")], true, {
        homeDir,
        platform: "linux",
      });
      expect(check.targets[0]?.action).toBe("relinked");
      expect(lstatSync(targetDir).isDirectory()).toBe(true);

      const applied = syncPromptTemplates([getHarness("pi")], false, {
        homeDir,
        platform: "linux",
      });
      expect(applied.targets[0]).toMatchObject({ action: "relinked", detail: undefined });
      expect(readlinkSync(targetDir)).toBe(sourceDir);
      expect(existsSync(join(homeDir, ".local", "share", "agntn", "diverged"))).toBe(false);
    });
  });

  it("backs up a directory holding harness-local templates before linking it", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "review.md"), "Review $ARGUMENTS.\n");
      const targetDir = join(homeDir, ".pi", "agent", "prompts");
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, "review.md"), "local version\n");
      writeFileSync(join(targetDir, "personal.md"), "only in Pi\n");

      const check = syncPromptTemplates([getHarness("pi")], true, {
        homeDir,
        platform: "linux",
      });
      expect(check.targets[0]?.action).toBe("adopted");
      expect(readFileSync(join(targetDir, "personal.md"), "utf8")).toBe("only in Pi\n");

      const applied = syncPromptTemplates([getHarness("pi")], false, {
        homeDir,
        platform: "linux",
      });
      const backup = applied.targets[0]?.detail;
      if (backup === undefined) throw new Error("Missing backup for adopted directory");
      expect(applied.targets[0]?.action).toBe("adopted");
      expect(readFileSync(join(backup, "review.md"), "utf8")).toBe("local version\n");
      expect(readFileSync(join(backup, "personal.md"), "utf8")).toBe("only in Pi\n");
      expect(readlinkSync(targetDir)).toBe(sourceDir);
      expect(existsSync(join(sourceDir, "personal.md"))).toBe(false);
    });
  });

  it("keeps a backup of a destination linked somewhere else", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      const dotfiles = join(homeDir, "dotfiles", "commands");
      const targetDir = join(homeDir, ".claude", "commands");
      mkdirSync(dotfiles, { recursive: true });
      mkdirSync(dirname(targetDir), { recursive: true });
      writeFileSync(join(dotfiles, "deploy.md"), "Deploy.\n");
      symlinkSync(dotfiles, targetDir);

      const [result] = syncPromptTemplates([getHarness("claude")], false, {
        homeDir,
        platform: "linux",
      }).targets;

      expect(result?.action).toBe("relinked");
      expect(readlinkSync(result?.detail ?? "")).toBe(dotfiles);
      expect(readlinkSync(targetDir)).toBe(sourceDir);
      expect(readFileSync(join(dotfiles, "deploy.md"), "utf8")).toBe("Deploy.\n");
    });
  });

  it("backs up a prompt directory across filesystems", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      const targetDir = join(homeDir, ".claude", "commands");
      mkdirSync(join(targetDir, "team"), { recursive: true });
      writeFileSync(join(targetDir, "team", "deploy.md"), "Deploy.\n");
      renameErrors.set(join(homeDir, ".local", "share", "agntn", "diverged"), "EXDEV");

      const [result] = syncPromptTemplates([getHarness("claude")], false, {
        homeDir,
        platform: "linux",
      }).targets;

      expect(result?.action).toBe("adopted");
      expect(readFileSync(join(result?.detail ?? "", "team", "deploy.md"), "utf8")).toBe(
        "Deploy.\n",
      );
      expect(readlinkSync(targetDir)).toBe(sourceDir);
    });
  });

  it("keeps only generated commands in the Gemini directory", () => {
    withoutXdgData(() => {
      const { homeDir, sourceDir } = fixture();
      writeFileSync(join(sourceDir, "review.md"), "Review this.\n");
      const targetDir = join(homeDir, ".gemini", "commands");
      const personal = join(targetDir, "personal.toml");
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(personal, 'prompt = "only in Gemini"\n');

      const check = syncPromptTemplates([getHarness("gemini")], true, {
        homeDir,
        platform: "linux",
      });
      expect(check.targets[0]?.templates.map(({ name, action }) => [name, action])).toEqual([
        ["review", "generated"],
        ["personal", "removed"],
      ]);
      expect(existsSync(personal)).toBe(true);

      const applied = syncPromptTemplates([getHarness("gemini")], false, {
        homeDir,
        platform: "linux",
      });
      const removed = applied.targets[0]?.templates.find(({ name }) => name === "personal");
      if (removed?.detail === undefined) throw new Error("Missing backup for foreign command");
      expect(readFileSync(removed.detail, "utf8")).toBe('prompt = "only in Gemini"\n');
      expect(existsSync(personal)).toBe(false);
      expect(existsSync(join(targetDir, "review.toml"))).toBe(true);
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
      expect(report.source).toBe(sourceDir);
      expect(report.targets[0]?.action).toBe("adopted");
      expect(report.targets[0]?.detail).toContain(
        join(xdgData, "agntn", "diverged", "prompts", "pi"),
      );
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
