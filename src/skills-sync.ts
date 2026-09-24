import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { syncDirectoryLink } from "./directory-link.ts";
import type { DirectoryLinkAction } from "./directory-link.ts";
import type { Harness } from "./harness.ts";
import { agntnDataDir } from "./resolve.ts";
import type { ResolveOptions } from "./types.ts";

export type SkillsSyncAction = DirectoryLinkAction;

/** One harness's outcome of a skill sync run. */
export interface SkillsSyncTargetResult {
  readonly id: string;
  readonly path?: string;
  readonly action: SkillsSyncAction;
  /** Backup path, skip reason, or a check-mode note. */
  readonly detail?: string;
}

/** Outcome of one skill sync run. */
export interface SkillsSyncReport {
  readonly source: string;
  readonly check: boolean;
  /** Source subdirectories that hold a SKILL.md. */
  readonly skills: readonly string[];
  readonly targets: readonly SkillsSyncTargetResult[];
}

function readSkills(sourceDir: string, check: boolean): string[] {
  let entries;
  try {
    entries = readdirSync(sourceDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!check) mkdirSync(sourceDir, { recursive: true });
    return [];
  }

  return entries
    .filter((entry) => {
      const path = join(sourceDir, entry);
      try {
        return statSync(path).isDirectory() && existsSync(join(path, "SKILL.md"));
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right));
}

function syncTarget(
  harness: Harness,
  sourceDir: string,
  check: boolean,
  options: ResolveOptions,
): SkillsSyncTargetResult {
  const target = harness.skillsSyncTarget;
  if (target === null) {
    return { id: harness.id, action: "skipped", detail: "no stable user-scope skills directory" };
  }

  const resolved = harness.resolveCandidates([target], options)[0];
  if (resolved === undefined) {
    return {
      id: harness.id,
      action: "skipped",
      detail: "skills directory is unavailable on this platform",
    };
  }
  // Registry paths end in a separator, which a directory symlink cannot carry.
  const targetDir = resolve(resolved.path);
  return {
    id: harness.id,
    path: targetDir,
    ...syncDirectoryLink("skills", harness.id, targetDir, sourceDir, check, options),
  };
}

/**
 * Links each harness's user-scope skills directory to the canonical skills
 * directory under the agntn XDG data directory, so a skill added or edited
 * through any harness lands in one place. Per-skill links into the source are
 * replaced; any other content is backed up first. In check mode nothing is
 * written.
 *
 * @param harnesses - Harnesses to inspect or update.
 * @param check - Report intended changes without writing them.
 * @param options - Path-resolution overrides.
 * @returns {SkillsSyncReport} Per-harness synchronization outcomes.
 */
export function syncSkills(
  harnesses: readonly Harness[],
  check = false,
  options: ResolveOptions = {},
): SkillsSyncReport {
  const source = join(agntnDataDir(options), "skills");
  const skills = readSkills(source, check);
  return {
    source,
    check,
    skills,
    targets: harnesses.map((harness) => syncTarget(harness, source, check, options)),
  };
}
