import { defineTool, Type } from "@agntn/tools";
import type { HarnessStatus } from "../tool-operations.ts";
import { entry, header, print, printed, s, wantsJson } from "./output.ts";

/**
 * @param status - One scanned harness.
 * @returns {string[]} The `harnesses run` modes it takes.
 */
function runModes(status: Readonly<HarnessStatus>): string[] {
  return (["advisor", "readOnly", "agent"] as const).filter((mode) => status[mode]);
}

/**
 * Prints the scan, one line per harness, installed ones in colour.
 *
 * @param results - Every scanned harness.
 */
function printScan(results: readonly Readonly<HarnessStatus>[]): void {
  print(header("System Scan"));
  print();
  const width = Math.max(...results.map((r) => r.id.length));
  const installed = results.filter((r) => r.installed);
  const nameWidth = Math.max(...installed.map((r) => r.name.length));
  const versionWidth = Math.max(...installed.map((r) => (r.version ? r.version.length + 1 : 0)));
  for (const r of results) {
    if (!r.installed) {
      print(entry(`${s.dim("○")} ${s.dim(r.id.padEnd(width))}  ${s.dim(r.name)}`));
      continue;
    }
    const version = (r.version ? `v${r.version}` : "").padEnd(versionWidth);
    const modes = runModes(r).join(" · ") || "no headless mode";
    print(
      entry(
        `${s.green("●")} ${s.hi(r.id.padEnd(width))}  ${r.name.padEnd(nameWidth)}  ${s.dim(version)}  ${s.dim(modes)}`,
      ),
    );
  }
  print();
}

export default defineTool({
  name: "harnesses_detect",
  title: "Detect Harnesses",
  description: "Detect installed harnesses, versions and run modes",
  effect: "read",
  input: Type.Object({}),
  async execute(_input, { host }) {
    const { detectHarnesses } = await import("../tool-operations.ts");
    const results = (await detectHarnesses()).details.harnesses;
    if (!wantsJson(host)) printScan(results);
    return printed(results);
  },
});
