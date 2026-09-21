import { defineCommand } from "citty";
import { consola } from "consola";
import { isHarnessId, listHarnesses } from "../registry.ts";
import { agentsSync } from "../tool-operations.ts";
import { formatArgs, report } from "./output.ts";

export default defineCommand({
  meta: { description: "Manage the shared global instructions file across harnesses" },
  subCommands: {
    sync: defineCommand({
      meta: {
        description:
          "Link global instructions and declared companions (agents.jsonc: source, companions, excludes)",
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
