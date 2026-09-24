/**
 * Directory links shared by prompt template and skill synchronization.
 * A harness destination becomes one link to the canonical source directory,
 * so an entry any harness adds or edits lands in the shared source.
 */
import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { moveFile } from "./agents-sync.ts";
import { agntnDataDir } from "./resolve.ts";
import type { ResolveOptions } from "./types.ts";

/** Kind of synchronized directory; names the backup folder under `diverged/`. */
export type LinkedDirectoryKind = "prompts" | "skills";

export type DirectoryLinkAction = "linked" | "relinked" | "adopted" | "unchanged" | "skipped";

/** Outcome of linking one harness destination to the source directory. */
export interface DirectoryLinkOutcome {
  readonly action: DirectoryLinkAction;
  /** Backup path, skip reason, or a check-mode note. */
  readonly detail?: string;
}

export const CHECK_DETAIL = "check mode: not applied";

export function linkTarget(path: string): string {
  const target = readlinkSync(path);
  return isAbsolute(target) ? target : resolve(dirname(path), target);
}

export function isInsideDirectory(path: string, directory: string): boolean {
  const remainder = relative(directory, path);
  return remainder !== "" && !remainder.startsWith("..") && !isAbsolute(remainder);
}

export function tempPath(path: string, kind: string): string {
  return join(dirname(path), `.${basename(path)}-${randomUUID()}.${kind}.tmp`);
}

function realDirectory(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Moves a destination into `diverged/<kind>/<id>` under the agntn data
 * directory. A symlink is recreated there instead of moving its target.
 *
 * @param kind - Synchronized directory kind.
 * @param id - Harness id.
 * @param path - Destination to move away.
 * @param options - Path-resolution overrides.
 * @returns {string} The backup path.
 */
export function backupDestination(
  kind: LinkedDirectoryKind,
  id: string,
  path: string,
  options: ResolveOptions,
): string {
  const backupDir = join(agntnDataDir(options), "diverged", kind, id);
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, `${basename(path)}-${Date.now()}-${randomUUID()}`);
  if (lstatSync(path).isSymbolicLink()) {
    symlinkSync(linkTarget(path), backup);
    unlinkSync(path);
    return backup;
  }
  moveFile(path, backup);
  return backup;
}

function linkDirectory(path: string, source: string, kind: LinkedDirectoryKind): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = tempPath(path, `${kind}-link`);
  // Junctions let Windows link a directory without symlink privileges.
  symlinkSync(source, temp, "junction");
  renameSync(temp, path);
}

type DirectoryState =
  | {
      readonly kind:
        | "missing"
        | "correct-link"
        | "wrong-link"
        | "local-files"
        | "not-directory"
        | "source";
    }
  | { readonly kind: "legacy-links"; readonly entries: readonly string[] };

const DIRECTORY_ACTION: Record<DirectoryState["kind"], DirectoryLinkAction> = {
  missing: "linked",
  "correct-link": "unchanged",
  "wrong-link": "relinked",
  "legacy-links": "relinked",
  "local-files": "adopted",
  "not-directory": "skipped",
  source: "skipped",
};

const SKIP_DETAIL: Partial<Record<DirectoryState["kind"], string>> = {
  "not-directory": "destination exists and is not a directory or symlink",
  source: "destination holds the source directory",
};

function isEntryLink(path: string, sourceDirs: readonly string[]): boolean {
  if (!lstatSync(path).isSymbolicLink()) return false;
  const target = linkTarget(path);
  return sourceDirs.some((directory) => isInsideDirectory(target, directory));
}

// Relinking a destination the source chain passes through would leave the
// source pointing at itself.
function linksThrough(sourceDir: string, targetDir: string): boolean {
  let path = sourceDir;
  for (let hop = 0; hop < 32; hop++) {
    if (path === targetDir || isInsideDirectory(path, targetDir)) return true;
    try {
      if (!lstatSync(path).isSymbolicLink()) return false;
    } catch {
      return false;
    }
    path = linkTarget(path);
  }
  return false;
}

function inspectDirectory(targetDir: string, sourceDir: string): DirectoryState {
  let stats;
  try {
    stats = lstatSync(targetDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    throw error;
  }

  if (stats.isSymbolicLink()) {
    if (linkTarget(targetDir) === sourceDir) return { kind: "correct-link" };
    return { kind: linksThrough(sourceDir, targetDir) ? "source" : "wrong-link" };
  }
  if (!stats.isDirectory()) return { kind: "not-directory" };
  return inspectLocalDirectory(targetDir, sourceDir);
}

function inspectLocalDirectory(targetDir: string, sourceDir: string): DirectoryState {
  // The source may itself be a link into this destination; moving the
  // destination away would then take the source content with it.
  const realSource = realDirectory(sourceDir);
  const realTarget = realpathSync(targetDir);
  if (realSource === realTarget || isInsideDirectory(realSource, realTarget)) {
    return { kind: "source" };
  }

  // Per-entry links into the source carry nothing worth a backup.
  const sourceDirs = realSource === sourceDir ? [sourceDir] : [sourceDir, realSource];
  const entries = readdirSync(targetDir).map((entry) => join(targetDir, entry));
  return entries.every((entry) => isEntryLink(entry, sourceDirs))
    ? { kind: "legacy-links", entries }
    : { kind: "local-files" };
}

function clearDirectory(
  kind: LinkedDirectoryKind,
  id: string,
  targetDir: string,
  state: DirectoryState,
  options: ResolveOptions,
): string | undefined {
  if (state.kind === "wrong-link" || state.kind === "local-files") {
    return backupDestination(kind, id, targetDir, options);
  }
  if (state.kind === "legacy-links") {
    for (const entry of state.entries) unlinkSync(entry);
    rmdirSync(targetDir);
  }
  return undefined;
}

/**
 * Makes `targetDir` one link to `sourceDir`. Per-entry links into the source
 * are replaced; a wrong link or local content is backed up first. In check
 * mode nothing is written.
 *
 * @param kind - Synchronized directory kind.
 * @param id - Harness id, used for the backup folder.
 * @param targetDir - Harness destination.
 * @param sourceDir - Canonical source directory.
 * @param check - Report the intended change without writing it.
 * @param options - Path-resolution overrides.
 * @returns {DirectoryLinkOutcome} The action taken or intended.
 */
export function syncDirectoryLink(
  kind: LinkedDirectoryKind,
  id: string,
  targetDir: string,
  sourceDir: string,
  check: boolean,
  options: ResolveOptions,
): DirectoryLinkOutcome {
  const state = inspectDirectory(targetDir, sourceDir);
  const action = DIRECTORY_ACTION[state.kind];
  if (state.kind === "correct-link") return { action };
  const skip = SKIP_DETAIL[state.kind];
  if (skip !== undefined) return { action, detail: skip };
  if (check) return { action, detail: CHECK_DETAIL };

  const detail = clearDirectory(kind, id, targetDir, state, options);
  linkDirectory(targetDir, sourceDir, kind);
  return { action, detail };
}
