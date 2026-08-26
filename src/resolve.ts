import os from "node:os";
import { join } from "node:path";
import type { ResolveOptions } from "./types.ts";

export function resolvePathTemplate(template: string, options: ResolveOptions = {}): string {
  const homeDir = options.homeDir ?? os.homedir();
  const projectRoot = options.projectRoot ?? process.cwd();

  return template
    .replace(/^~(?=\/|$)/, homeDir)
    .replaceAll("${HOME}", homeDir)
    .replaceAll("${PROJECT_ROOT}", projectRoot)
    .replace(/%([^%]+)%/g, (match, name) => process.env[name] ?? match);
}

/** The agntn config directory: $XDG_CONFIG_HOME/agntn or ~/.config/agntn. */
export function agntnConfigDir(options: ResolveOptions = {}): string {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME !== ""
      ? process.env.XDG_CONFIG_HOME
      : join(options.homeDir ?? os.homedir(), ".config");
  return join(base, "agntn");
}
