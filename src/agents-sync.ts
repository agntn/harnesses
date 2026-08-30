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

function agentsConfigRecord(raw: string, configPath: string): Record<string, unknown> {
  const parsed = parseJsonc(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Agents config at ${configPath} is not an object`);
  }
  return parsed as Record<string, unknown>;
}

function agentsSource(value: unknown, defaultSource: string, options: ResolveOptions): string {
  if (typeof value !== "string") return defaultSource;
  const expanded = resolvePathTemplate(value, options);
  // A relative source would produce cwd-dependent, dangling links in every
  // harness, so anchor it to the config directory it was declared in.
  return isAbsolute(expanded) ? expanded : join(agntnConfigDir(options), expanded);
}

function agentsExcludes(value: unknown, configPath: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Agents config at ${configPath} has an invalid excludes: expected an array of harness ids`,
    );
  }
  return value as string[];
}

/**
 * Reads agents.jsonc; missing file falls back to defaults.
 *
 * @param options - Path-resolution overrides.
 * @returns {AgentsConfig} The normalized sync configuration.
 */
export function readAgentsConfig(options: ResolveOptions = {}): AgentsConfig {
  const configPath = join(agntnConfigDir(options), "agents.jsonc");
  const defaults: AgentsConfig = {
    source: join(agntnConfigDir(options), "AGENTS.md"),
    excludes: [],
  };

  const raw = readIfExists(configPath);
  if (raw === null) return defaults;

  const record = agentsConfigRecord(raw, configPath);
  return {
    source: agentsSource(record.source, defaults.source, options),
    excludes: agentsExcludes(record.excludes, configPath),
    configPath,
  };
}

type LinkState =
  | { readonly kind: "missing" }
  | { readonly kind: "correct-link" }
  | { readonly kind: "wrong-link" }
  | { readonly kind: "identical-file" }
  | { readonly kind: "diverged-file" };

function inspectRegularFile(path: string, source: string): LinkState {
  const content = readIfExists(path) ?? "";
  const sourceContent = readIfExists(source) ?? "";
  if (content.trim() === "" || content === sourceContent) return { kind: "identical-file" };
  return { kind: "diverged-file" };
}

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

  return inspectRegularFile(path, source);
}

/**
 * Replaces whatever sits at `path` with a symlink to `source`, atomically.
 *
 * @param path - Harness instructions path to replace.
 * @param source - Master instructions path to link.
 */
function relink(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${Date.now()}-${process.pid}.agents.tmp`);
  symlinkSync(source, temp);
  renameSync(temp, path);
}

const CHECK_ACTION: Record<LinkState["kind"], AgentsTargetResult["action"]> = {
  missing: "linked",
  "correct-link": "unchanged",
  "wrong-link": "relinked",
  "identical-file": "relinked",
  "diverged-file": "adopted",
};

function applyTarget(
  harness: Harness,
  path: string,
  state: LinkState,
  config: AgentsConfig,
  options: ResolveOptions,
): AgentsTargetResult {
  if (state.kind === "diverged-file") {
    const backupDir = join(agntnConfigDir(options), "diverged");
    mkdirSync(backupDir, { recursive: true });
    const backup = join(backupDir, `${harness.id}-${basename(path)}-${Date.now()}.md`);
    renameSync(path, backup);
    relink(path, config.source);
    return { id: harness.id, path, action: "adopted", detail: backup };
  }

  if (state.kind === "wrong-link") unlinkSync(path);
  if (state.kind === "wrong-link" || state.kind === "identical-file") {
    relink(path, config.source);
    return { id: harness.id, path, action: "relinked" };
  }

  relink(path, config.source);
  return { id: harness.id, path, action: "linked" };
}

function syncTarget(
  harness: Harness,
  config: AgentsConfig,
  check: boolean,
  options: ResolveOptions,
): AgentsTargetResult {
  if (config.excludes.includes(harness.id)) {
    return { id: harness.id, action: "skipped", detail: "excluded by the agents config" };
  }
  if (!harness.agentsFile) {
    return {
      id: harness.id,
      action: "skipped",
      detail: "no stable user-scope instructions file",
    };
  }

  const path = resolvePathTemplate(harness.agentsFile, options);
  const state = inspectTarget(path, config.source);
  if (state.kind === "correct-link") return { id: harness.id, path, action: "unchanged" };
  if (check) {
    return {
      id: harness.id,
      path,
      action: CHECK_ACTION[state.kind],
      detail: "check mode: not applied",
    };
  }
  return applyTarget(harness, path, state, config, options);
}

/**
 * Links every harness's user-scope instructions file to the master. In check
 * mode nothing is written; the report shows what a real run would do.
 *
 * @param harnesses - Harnesses to inspect or update.
 * @param check - Report intended changes without writing them.
 * @param options - Path-resolution overrides.
 * @returns {AgentsSyncReport} Per-harness synchronization outcomes.
 */
export function syncAgentsFiles(
  harnesses: readonly Harness[],
  check = false,
  options: ResolveOptions = {},
): AgentsSyncReport {
  const config = readAgentsConfig(options);
  if (readIfExists(config.source) === null) {
    throw new Error(`No master agents file at ${config.source}`);
  }
  return {
    source: config.source,
    check,
    targets: harnesses.map((harness) => syncTarget(harness, config, check, options)),
  };
}
