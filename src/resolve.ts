import os from "node:os";
import { join } from "node:path";
import type { ResolveOptions } from "./types.ts";

/**
 * Every marker a path template can carry, matched in one pass so a substituted
 * value is never scanned for markers again.
 */
const PATH_MARKERS = /^~(?=\/|$)|\$\{HOME\}|\$\{PROJECT_ROOT\}|%([^%]+)%/g;

export function resolvePathTemplate(template: string, options: ResolveOptions = {}): string {
  const homeDir = options.homeDir ?? os.homedir();
  const projectRoot = options.projectRoot ?? process.cwd();

  return template.replaceAll(PATH_MARKERS, (match: string, name: string | undefined) => {
    if (match === "${PROJECT_ROOT}") return projectRoot;
    if (name === undefined) return homeDir;
    return process.env[name] ?? match;
  });
}

/**
 * The agntn config directory: $XDG_CONFIG_HOME/agntn or ~/.config/agntn.
 *
 * @param options - Path-resolution overrides.
 * @returns {string} The resolved agntn configuration directory.
 */
export function agntnConfigDir(options: ResolveOptions = {}): string {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME !== ""
      ? process.env.XDG_CONFIG_HOME
      : join(options.homeDir ?? os.homedir(), ".config");
  return join(base, "agntn");
}

/**
 * The agntn data directory: $XDG_DATA_HOME/agntn or ~/.local/share/agntn.
 *
 * @param options - Path-resolution overrides.
 * @returns {string} The resolved agntn data directory.
 */
export function agntnDataDir(options: ResolveOptions = {}): string {
  const base =
    process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME !== ""
      ? process.env.XDG_DATA_HOME
      : join(options.homeDir ?? os.homedir(), ".local", "share");
  return join(base, "agntn");
}
