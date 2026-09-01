/**
 * Symlink-based sync of the global agent instructions file across harnesses.
 *
 * The master file (default ~/.config/agntn/AGENTS.md, overridable via
 * ~/.config/agntn/agents.jsonc) is the single physical copy; every harness's
 * user-scope instructions file becomes a symlink to it, so an edit made
 * through any harness lands in the master and is visible everywhere at once.
 * Explicit companion files are linked beside each instructions target. Sync
 * is a doctor: it creates missing links, repairs wrong ones, adopts diverged
 * regular files (content moved to a backup, then relinked), and in check mode
 * only reports.
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
import { basename, dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";
import type { Harness } from "./harness.ts";
import { parseJsonc } from "./mcp-servers.ts";
import { agntnConfigDir, resolvePathTemplate } from "./resolve.ts";
import type { ResolveOptions } from "./types.ts";

/** Configuration read from agents.jsonc. */
export interface AgentsConfig {
  /** The master instructions file every harness links to. */
  source: string;
  /** Relative files to link beside every harness instructions target. */
  companions: string[];
  /** Harness ids the sync leaves untouched. */
  excludes: string[];
  /** Path the config was read from; absent when defaults were used. */
  configPath?: string;
}

export type AgentsSyncAction = "linked" | "relinked" | "adopted" | "unchanged" | "skipped";

/** One companion file's outcome for a harness target. */
export interface AgentsCompanionTargetResult {
  readonly source: string;
  readonly path: string;
  readonly action: Exclude<AgentsSyncAction, "skipped">;
  /** Backup path for an adopted file, or a check-mode note. */
  readonly detail?: string;
}

/** One harness's outcome of an agents sync run. */
export interface AgentsTargetResult {
  id: string;
  path?: string;
  action: AgentsSyncAction;
  /** Reason for a skip, or the backup path for an adopted diverged file. */
  detail?: string;
  /** Companion outcomes, present when companions are configured. */
  companions?: readonly AgentsCompanionTargetResult[];
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

function agentsSource(
  value: unknown,
  defaultSource: string,
  options: ResolveOptions,
  configPath: string,
): string {
  if (value === undefined) return defaultSource;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Agents config at ${configPath} has an invalid source: expected a path string`);
  }
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

function companionPath(value: string, configPath: string): string {
  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    posix.isAbsolute(normalized) ||
    win32.parse(value).root !== ""
  ) {
    throw new Error(
      `Agents config at ${configPath} has an unsafe companion path: ${JSON.stringify(normalized)}`,
    );
  }
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function comparablePath(path: string): string {
  // Reject lexical and case-only aliases on every platform so one config
  // remains portable to the case-insensitive filesystems common on Windows
  // and macOS.
  return resolve(path).toLowerCase();
}

function agentsCompanions(value: unknown, configPath: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Agents config at ${configPath} has invalid companions: expected an array of relative paths`,
    );
  }

  const companions = (value as string[]).map((path) => companionPath(path, configPath));
  const comparable = companions.map(comparablePath);
  if (new Set(comparable).size !== comparable.length) {
    throw new Error(`Agents config at ${configPath} has duplicate companion paths`);
  }
  return companions;
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
    companions: [],
    excludes: [],
  };

  const raw = readIfExists(configPath);
  if (raw === null) return defaults;

  const record = agentsConfigRecord(raw, configPath);
  return {
    source: agentsSource(record.source, defaults.source, options, configPath),
    companions: agentsCompanions(record.companions, configPath),
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

type AgentsFileResult = Omit<AgentsCompanionTargetResult, "source">;

const CHECK_ACTION: Record<LinkState["kind"], AgentsFileResult["action"]> = {
  missing: "linked",
  "correct-link": "unchanged",
  "wrong-link": "relinked",
  "identical-file": "relinked",
  "diverged-file": "adopted",
};

function applyFileTarget(
  id: string,
  path: string,
  source: string,
  state: LinkState,
  options: ResolveOptions,
): AgentsFileResult {
  if (state.kind === "diverged-file") {
    const backupDir = join(agntnConfigDir(options), "diverged");
    mkdirSync(backupDir, { recursive: true });
    const backup = join(backupDir, `${id}-${basename(path)}-${Date.now()}.md`);
    renameSync(path, backup);
    relink(path, source);
    return { path, action: "adopted", detail: backup };
  }

  if (state.kind === "wrong-link") unlinkSync(path);
  if (state.kind === "wrong-link" || state.kind === "identical-file") {
    relink(path, source);
    return { path, action: "relinked" };
  }

  relink(path, source);
  return { path, action: "linked" };
}

function syncFileTarget(
  id: string,
  path: string,
  source: string,
  check: boolean,
  options: ResolveOptions,
): AgentsFileResult {
  const state = inspectTarget(path, source);
  if (state.kind === "correct-link") return { path, action: "unchanged" };
  if (check) {
    return {
      path,
      action: CHECK_ACTION[state.kind],
      detail: "check mode: not applied",
    };
  }
  return applyFileTarget(id, path, source, state, options);
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
  const target = syncFileTarget(harness.id, path, config.source, check, options);
  if (config.companions.length === 0) return { id: harness.id, ...target };

  const companions = config.companions.map((relativePath) => {
    const source = resolve(dirname(config.source), relativePath);
    const companionPath = resolve(dirname(path), relativePath);
    return {
      source,
      ...syncFileTarget(harness.id, companionPath, source, check, options),
    };
  });
  return { id: harness.id, ...target, companions };
}

function preflightCompanions(
  harnesses: readonly Harness[],
  config: AgentsConfig,
  options: ResolveOptions,
): void {
  for (const relativePath of config.companions) {
    const source = resolve(dirname(config.source), relativePath);
    if (comparablePath(source) === comparablePath(config.source)) {
      throw new Error(`Companion path resolves to the master agents file: ${relativePath}`);
    }
    if (readIfExists(source) === null) {
      throw new Error(`No companion agents file at ${source}`);
    }
  }

  for (const harness of harnesses) {
    if (config.excludes.includes(harness.id) || !harness.agentsFile) continue;
    const path = resolvePathTemplate(harness.agentsFile, options);
    const collision = config.companions.find(
      (relativePath) =>
        comparablePath(resolve(dirname(path), relativePath)) === comparablePath(path),
    );
    if (collision !== undefined) {
      throw new Error(`Companion path collides with ${harness.id} instructions: ${collision}`);
    }
  }
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
  preflightCompanions(harnesses, config, options);
  return {
    source: config.source,
    check,
    targets: harnesses.map((harness) => syncTarget(harness, config, check, options)),
  };
}
