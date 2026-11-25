import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Where one executable resolves, in the order `spawn` searches. */
export interface BinaryLocation {
  /** Name the harness spawns. */
  binary: string;
  /** File a spawn starts; null when nothing on `PATH` answers to the name. */
  path: string | null;
  /** Further copies later on `PATH`, hidden behind `path`. */
  shadowed: string[];
}

/** Lookup inputs, the live process by default. */
export interface LookupOptions {
  /** Search path; defaults to `process.env.PATH`. */
  readonly path?: string | undefined;
  /** Platform whose search rules apply; defaults to `process.platform`. */
  readonly platform?: string;
  /** Directory that relative entries resolve against; defaults to `process.cwd()`. */
  readonly cwd?: string;
}

/** What libuv falls back to on POSIX when the environment has no `PATH`. */
const DEFAULT_POSIX_PATH = "/usr/bin:/bin";

/**
 * @param binary - Name or path to look up.
 * @param windows - Whether Windows rules apply.
 * @returns {string[]} File names libuv tries in each directory.
 */
function candidateNames(binary: string, windows: boolean): string[] {
  if (!windows) return [binary];
  const named = /\.[^.\\/]+$/.test(binary) ? [binary] : [];
  return [...named, `${binary}.com`, `${binary}.exe`];
}

/**
 * Joins without folding `..`, which POSIX walks through symlinks, not lexically.
 *
 * @param dir - Directory as `PATH` spells it.
 * @param name - File name, or a path of its own.
 * @returns {string} The path a spawn hands the kernel.
 */
function posixJoin(dir: string, name: string): string {
  const joined = name.startsWith("/") ? name : `${dir}/${name}`;
  return joined.replaceAll(/\/\.(?=\/|$)/gu, "").replaceAll(/\/{2,}/gu, "/");
}

/**
 * An empty POSIX entry is the current directory, as execvp reads it.
 *
 * @param binary - Name or path to look up.
 * @param options - Search path, platform and cwd.
 * @returns {string[]} Directories in search order.
 */
function searchDirs(binary: string, options: Required<LookupOptions>): string[] {
  const windows = options.platform === "win32";
  const { cwd } = options;
  if (binary.includes("/") || (windows && binary.includes("\\"))) return [cwd];
  if (!windows) {
    return options.path.split(":").map((entry) => (entry === "" ? cwd : posixJoin(cwd, entry)));
  }
  const entries = options.path
    .split(";")
    .map((entry) => entry.replaceAll('"', ""))
    .filter((entry) => entry !== "");
  return [cwd, ...entries.map((entry) => resolve(cwd, entry))];
}

/**
 * @param file - Candidate file.
 * @param windows - Whether Windows rules apply, where any file runs.
 * @returns {boolean} Whether a spawn could start it.
 */
function runnable(file: string, windows: boolean): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (!windows) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param file - A file that exists.
 * @returns {string} Its real path, or the file itself when that can't be read.
 */
function realOrSelf(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/**
 * @param options - Lookup inputs, maybe partial.
 * @returns {Required<LookupOptions>} The same inputs, the live process filling the gaps.
 */
function withDefaults(options: LookupOptions): Required<LookupOptions> {
  const platform = options.platform ?? process.platform;
  const fallback = platform === "win32" ? "" : DEFAULT_POSIX_PATH;
  return {
    path: options.path ?? process.env.PATH ?? fallback,
    platform,
    cwd: options.cwd ?? process.cwd(),
  };
}

/**
 * Every file `spawn` could start for a name; a file reached twice counts once.
 *
 * @param binary - Name or path to look up.
 * @param options - Search path, platform and cwd.
 * @returns {string[]} Matching files in search order.
 */
export function findExecutables(binary: string, options: LookupOptions = {}): string[] {
  const lookup = withDefaults(options);
  const windows = lookup.platform === "win32";
  const names = candidateNames(binary, windows);
  const seen = new Set<string>();
  const found: string[] = [];
  for (const dir of searchDirs(binary, lookup)) {
    for (const name of names) {
      const file = windows ? resolve(dir, name) : posixJoin(dir, name);
      if (!runnable(file, windows)) continue;
      const real = realOrSelf(file);
      if (seen.has(real)) continue;
      seen.add(real);
      found.push(file);
    }
  }
  return found;
}

/**
 * @param binary - Name or path to look up.
 * @param options - Search path, platform and cwd.
 * @returns {BinaryLocation} The file that runs and the copies it hides.
 */
export function locateBinary(binary: string, options: LookupOptions = {}): BinaryLocation {
  const [path = null, ...shadowed] = findExecutables(binary, options);
  return { binary, path, shadowed };
}
