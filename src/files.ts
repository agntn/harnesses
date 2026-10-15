import { readFileSync } from "node:fs";

/**
 * Reads a file, mapping a missing one to null instead of an error.
 *
 * @param path - File path to read.
 * @returns {string | null} File contents, or null when missing.
 */
export function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
