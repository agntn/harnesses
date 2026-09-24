import { defineCommand } from "citty";
import { skillsSync } from "../tool-operations.ts";
import { formatArgs, report } from "./output.ts";

export default defineCommand({
  meta: { description: "Manage shared skills across harnesses" },
  subCommands: {
    sync: defineCommand({
      meta: {
        description:
          "Link harness skills directories to the skills folder in the agntn XDG data directory",
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
        report(skillsSync(id, args.check === true), args);
      },
    }),
  },
});
