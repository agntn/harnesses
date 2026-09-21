import { defineCommand } from "citty";
import { promptsSync } from "../tool-operations.ts";
import { formatArgs, report } from "./output.ts";

export default defineCommand({
  meta: { description: "Manage shared prompt templates across harnesses" },
  subCommands: {
    sync: defineCommand({
      meta: {
        description:
          "Sync Markdown templates from the agntn XDG data directory into harness destinations",
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
        report(promptsSync(id, args.check === true), args);
      },
    }),
  },
});
