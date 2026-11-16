import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Newest ctime under `directory`; ctime can't be backdated.
 *
 * @param directory - Root of the tree.
 * @returns {number} The newest ctime in milliseconds.
 */
export function lastSourceChange(directory: string): number {
  let newest = statSync(directory).ctimeMs;
  for (const entry of readdirSync(directory, { encoding: "utf8", recursive: true })) {
    const stats = statSync(join(directory, entry), { throwIfNoEntry: false });
    if (stats && stats.ctimeMs > newest) newest = stats.ctimeMs;
  }
  return newest;
}

/**
 * Whether anything under `directory` changed after `since`, removal included.
 *
 * @param directory - Source tree the server loads.
 * @param since - Epoch milliseconds before `src/` loaded.
 * @returns {() => boolean} Whether the tree changed since then.
 */
export function sourceChangeCheck(directory: string, since: number): () => boolean {
  return () => {
    try {
      return lastSourceChange(directory) > since;
    } catch {
      return true;
    }
  };
}
