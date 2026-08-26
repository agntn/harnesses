/**
 * Symlink-based sync of the global agent instructions file across harnesses.
 *
 * The master file (default ~/.config/agntn/AGENTS.md, overridable via
 * ~/.config/agntn/agents.jsonc) is the single physical copy; every harness's
 * user-scope instructions file becomes a symlink to it, so an edit made
 * through any harness lands in the master and is visible everywhere at once.
 * Sync is a doctor: it creates missing links, repairs wrong ones, adopts
 * diverged regular files (content moved to a backup, then relinked), and in
 * check mode only reports.
 */
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Harness } from "./harness.ts";
import { parseJsonc } from "./mcp-servers.ts";
import { agntnConfigDir, resolvePathTemplate } from "./resolve.ts";
import type { ResolveOptions } from "./types.ts";

/** Configuration read from agents.jsonc. */
export interface AgentsConfig {
  /** The master instructions file every harness links to. */
  source: string;
  /** Harness ids the sync leaves untouched. */
  excludes: string[];
  /** Path the config was read from; absent when defaults were used. */
  configPath?: string;
}

/** One harness's outcome of an agents sync run. */
export interface AgentsTargetResult {
  id: string;
  path?: string;
  action: "linked" | "relinked" | "adopted" | "unchanged" | "skipped";
  /** Reason for a skip, or the backup path for an adopted diverged file. */
  detail?: string;
}

/** Outcome of one agents sync/doctor run. */
export interface AgentsSyncReport {
  source: string;
  check: boolean;
  targets: AgentsTargetResult[];
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Reads agents.jsonc; missing file falls back to defaults. */
export function readAgentsConfig(options: ResolveOptions = {}): AgentsConfig {
  const configPath = join(agntnConfigDir(options), "agents.jsonc");
  const defaults: AgentsConfig = {
    source: join(agntnConfigDir(options), "AGENTS.md"),
    excludes: [],
  };

  const raw = readIfExists(configPath);
  if (raw === null) return defaults;

  const parsed = parseJsonc(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Agents config at ${configPath} is not an object`);
  }
  const record = parsed as Record<string, unknown>;

  const expandedSource =
    typeof record.source === "string" ? resolvePathTemplate(record.source, options) : undefined;
  // A relative source would produce cwd-dependent, dangling links in every
  // harness, so anchor it to the config directory it was declared in.
  const source =
    expandedSource === undefined
      ? defaults.source
      : isAbsolute(expandedSource)
        ? expandedSource
        : join(agntnConfigDir(options), expandedSource);

  const rawExcludes = record.excludes;
  if (
    rawExcludes !== undefined &&
    (!Array.isArray(rawExcludes) || rawExcludes.some((item) => typeof item !== "string"))
  ) {
    throw new Error(
      `Agents config at ${configPath} has an invalid excludes: expected an array of harness ids`,
    );
  }

  return {
    source,
    excludes: (rawExcludes as string[] | undefined) ?? [],
    configPath,
  };
}

type LinkState =
  | { kind: "missing" }
  | { kind: "correct-link" }
  | { kind: "wrong-link" }
  | { kind: "identical-file" }
  | { kind: "diverged-file" };

function inspectTarget(path: string, source: string): LinkState {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    throw error;
  }

  if (stats.isSymbolicLink()) {
    // Compare the literal link target, not realpath: the master path is the
    // stable interface (it may itself be a link into a versioned backend),
    // and a harness file linking straight past it would stop following when
    // the backend behind the master changes.
    const target = readlinkSync(path);
    const resolved = isAbsolute(target) ? target : resolve(dirname(path), target);
    return resolved === source ? { kind: "correct-link" } : { kind: "wrong-link" };
  }

  const content = readIfExists(path) ?? "";
  const sourceContent = readIfExists(source) ?? "";
  return content.trim() === "" || content === sourceContent
    ? { kind: "identical-file" }
    : { kind: "diverged-file" };
}

/** Replaces whatever sits at `path` with a symlink to `source`, atomically. */
function relink(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${Date.now()}-${process.pid}.agents.tmp`);
  symlinkSync(source, temp);
  renameSync(temp, path);
}

/**
 * Links every harness's user-scope instructions file to the master. In check
 * mode nothing is written; the report shows what a real run would do.
 */
export function syncAgentsFiles(
  harnesses: Harness[],
  check = false,
  options: ResolveOptions = {},
): AgentsSyncReport {
  const config = readAgentsConfig(options);
  if (readIfExists(config.source) === null) {
    throw new Error(`No master agents file at ${config.source}`);
  }

  const targets: AgentsTargetResult[] = [];
  for (const harness of harnesses) {
    if (config.excludes.includes(harness.id)) {
      targets.push({ id: harness.id, action: "skipped", detail: "excluded by the agents config" });
      continue;
    }
    if (!harness.agentsFile) {
      targets.push({
        id: harness.id,
        action: "skipped",
        detail: "no stable user-scope instructions file",
      });
      continue;
    }

    const path = resolvePathTemplate(harness.agentsFile, options);
    const state = inspectTarget(path, config.source);

    if (state.kind === "correct-link") {
      targets.push({ id: harness.id, path, action: "unchanged" });
      continue;
    }

    if (check) {
      const action =
        state.kind === "missing"
          ? "linked"
          : state.kind === "diverged-file"
            ? "adopted"
            : "relinked";
      targets.push({ id: harness.id, path, action, detail: "check mode: not applied" });
      continue;
    }

    if (state.kind === "diverged-file") {
      const backupDir = join(agntnConfigDir(options), "diverged");
      mkdirSync(backupDir, { recursive: true });
      const backup = join(backupDir, `${harness.id}-${basename(path)}-${Date.now()}.md`);
      renameSync(path, backup);
      relink(path, config.source);
      targets.push({ id: harness.id, path, action: "adopted", detail: backup });
      continue;
    }

    if (state.kind === "wrong-link" || state.kind === "identical-file") {
      if (state.kind === "wrong-link") {
        // renameSync over a symlink replaces it, but remove explicitly so a
        // dangling link never survives a partial failure.
        unlinkSync(path);
      }
      relink(path, config.source);
      targets.push({ id: harness.id, path, action: "relinked" });
      continue;
    }

    relink(path, config.source);
    targets.push({ id: harness.id, path, action: "linked" });
  }

  return { source: config.source, check, targets };
}
