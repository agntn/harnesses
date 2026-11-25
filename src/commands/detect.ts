import { defineTool, Type } from "@agntn/tools";
import type { HarnessStatus } from "../tool-operations.ts";
import { entry, header, print, printed, s, sanitize, wantsJson } from "./output.ts";

/**
 * @param status - One scanned harness.
 * @returns {string[]} The `harnesses run` modes it takes.
 */
function runModes(status: HarnessStatus): string[] {
  return (["advisor", "readOnly", "agent"] as const).filter((mode) => status[mode]);
}

/**
 * @param status - One installed harness.
 * @returns {string} Its run modes, or a word that it has none.
 */
function modesLabel(status: HarnessStatus): string {
  return runModes(status).join(" · ") || "no headless mode";
}

/**
 * @param status - One installed harness.
 * @returns {string[]} Indented notes on shadowed copies and a separate run binary.
 */
function binaryNotes(status: HarnessStatus): string[] {
  const notes = (status.shadowed ?? []).map((copy) => `shadows ${sanitize(copy)}`);
  if (status.runPath !== undefined) {
    notes.push(
      status.runPath === null ? "run binary not on PATH" : `runs ${sanitize(status.runPath)}`,
    );
  }
  notes.push(...(status.runShadowed ?? []).map((copy) => `which shadows ${sanitize(copy)}`));
  return notes.map((note) => entry(`  ${s.dim(note)}`));
}

/**
 * Prints the scan, one line per harness, installed ones in colour.
 *
 * @param results - Every scanned harness.
 */
function printScan(results: readonly HarnessStatus[]): void {
  print(header("System Scan"));
  print();
  const width = Math.max(...results.map((r) => r.id.length));
  const installed = results.filter((r) => r.installed);
  const nameWidth = Math.max(...installed.map((r) => r.name.length));
  const versionWidth = Math.max(...installed.map((r) => (r.version ? r.version.length + 1 : 0)));
  const modesWidth = Math.max(...installed.map((r) => modesLabel(r).length));
  for (const r of results) {
    if (!r.installed) {
      print(entry(`${s.dim("○")} ${s.dim(r.id.padEnd(width))}  ${s.dim(r.name)}`));
      continue;
    }
    const version = (r.version ? `v${r.version}` : "").padEnd(versionWidth);
    const modes = modesLabel(r).padEnd(modesWidth);
    const path = sanitize(r.path ?? "not on PATH");
    print(
      entry(
        `${s.green("●")} ${s.hi(r.id.padEnd(width))}  ${r.name.padEnd(nameWidth)}  ${s.dim(version)}  ${s.dim(modes)}  ${s.dim(path)}`,
      ),
    );
    for (const note of binaryNotes(r)) print(note);
  }
  print();
}

export default defineTool({
  name: "harnesses_detect",
  title: "Detect Harnesses",
  description: "Detect installed harnesses, their paths, versions and run modes",
  effect: "read",
  input: Type.Object({}),
  async execute(_input, { host }) {
    const { detectHarnesses } = await import("../tool-operations.ts");
    const results = (await detectHarnesses()).details.harnesses;
    if (!wantsJson(host)) printScan(results);
    return printed(results);
  },
});
