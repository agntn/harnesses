import { stripVTControlCharacters } from "node:util";
import { defineCommand } from "citty";
import { consola } from "consola";
import { encode as toToon } from "@toon-format/toon";
import { isHarnessId, listHarnesses } from "../registry.ts";
import { agentsSync, type ToolResult } from "../tool-operations.ts";

const formatArgs = {
  json: { type: "boolean" as const, description: "Output as JSON" },
  toon: { type: "boolean" as const, description: "Output as TOON" },
};

// Sync reports echo backup paths and config values, so strip terminal controls.
// oxlint-disable-next-line no-control-regex -- Terminal control bytes are precisely what this boundary removes.
const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

function report(result: ToolResult<unknown>, args: { json?: boolean; toon?: boolean }): void {
  const sanitize = (text: string | undefined) =>
    stripVTControlCharacters(text ?? "").replace(UNSAFE_TERMINAL_CONTROLS, " ");
  if (result.isError) {
    consola.error(sanitize(result.content[0]?.text));
    process.exit(1);
  }
  if (args.json) {
    console.log(JSON.stringify(result.details, null, 2));
    return;
  }
  if (args.toon) {
    console.log(toToon(result.details));
    return;
  }
  console.log(sanitize(result.content[0]?.text));
}

export default defineCommand({
  meta: { description: "Manage the shared global instructions file across harnesses" },
  subCommands: {
    sync: defineCommand({
      meta: {
        description:
          "Link every harness's global instructions file to the master (agents.jsonc: source, excludes)",
      },
      args: {
        id: { type: "positional" as const, description: "Harness id", required: false },
        check: {
          type: "boolean" as const,
          description: "Report what would change without writing anything",
        },
        ...formatArgs,
      },
      run({ args }) {
        const id = args.id === undefined ? undefined : (args.id as string);
        if (id !== undefined && !isHarnessId(id)) {
          consola.error(`Unknown harness: ${id}\nKnown: ${listHarnesses().join(", ")}`);
          process.exit(1);
        }
        report(agentsSync(id, args.check === true), args);
      },
    }),
  },
});
