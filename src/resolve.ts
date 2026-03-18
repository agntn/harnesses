import os from "node:os";
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
