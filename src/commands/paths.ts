import { defineTool, Type } from "@agntn/tools";
import { harnessId, resolveHarness } from "./harness-id.ts";
import { entry, header, print, printed, s, section, wantsJson } from "./output.ts";

/**
 * @param title - Section title.
 * @param entries - Resolved paths of one category.
 */
function printResolved(title: string, entries: readonly { readonly path: string }[]): void {
  if (entries.length === 0) return;
  print(section(title));
  for (const item of entries) print(entry(s.hi(item.path)));
}

export default defineTool({
  name: "harnesses_paths",
  title: "Show Harness Paths",
  description: "Show resolved paths for current platform",
  effect: "read",
  input: Type.Object({ id: harnessId }, { additionalProperties: false }),
  cli: { positional: ["id"], plain: ["id"] },
  async execute({ id }, { host }) {
    const { harness, refusal } = await resolveHarness(id);
    if (refusal) return refusal;
    const resolved = harness.resolve();
    if (wantsJson(host)) return printed(resolved);

    print(header(`${harness.name}  ${s.dim(process.platform)}`));
    printResolved("Config", resolved.config);
    printResolved("Sessions", resolved.sessions);
    printResolved("Instructions", resolved.instructions);
    printResolved("Skills", resolved.skills);
    printResolved("Commands", resolved.commands);
    printResolved("Prompt templates", resolved.promptTemplates);
    printResolved("Hooks", resolved.hooks);
    printResolved("Temp", resolved.temp);
    print();
    return printed(resolved);
  },
});
