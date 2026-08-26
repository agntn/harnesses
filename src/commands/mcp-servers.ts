import { stripVTControlCharacters } from "node:util";
import { defineCommand } from "citty";
import { consola } from "consola";
import { encode as toToon } from "@toon-format/toon";
import { isHarnessId, listHarnesses } from "../registry.ts";
import { mcpAdd, mcpList, mcpRemove, mcpSync, type ToolResult } from "../tool-operations.ts";

const formatArgs = {
  json: { type: "boolean" as const, description: "Output as JSON" },
  toon: { type: "boolean" as const, description: "Output as TOON" },
};

// MCP listings echo values read from project-controlled config files, so a
// malicious server name could smuggle ANSI/OSC sequences into the terminal.
// oxlint-disable-next-line no-control-regex -- Terminal control bytes are precisely what this boundary removes.
const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

function sanitize(text: string | undefined): string {
  return stripVTControlCharacters(text ?? "").replace(UNSAFE_TERMINAL_CONTROLS, " ");
}

/** Emits one tool result: machine format when asked, sanitized text otherwise. */
function report(result: ToolResult<unknown>, args: { json?: boolean; toon?: boolean }): void {
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

function requireHarnessId(id: string): string {
  if (!isHarnessId(id)) {
    consola.error(`Unknown harness: ${id}\nKnown: ${listHarnesses().join(", ")}`);
    process.exit(1);
  }
  return id;
}

export default defineCommand({
  meta: { description: "Manage MCP servers across harness configs" },
  subCommands: {
    list: defineCommand({
      meta: { description: "List configured MCP servers, normalized" },
      args: {
        id: { type: "positional" as const, description: "Harness id", required: false },
        ...formatArgs,
      },
      run({ args }) {
        const id = args.id === undefined ? undefined : requireHarnessId(args.id as string);
        report(mcpList(id), args);
      },
    }),
    add: defineCommand({
      meta: { description: "Add or replace one MCP server in a harness config" },
      args: {
        id: { type: "positional" as const, description: "Harness id", required: true },
        name: { type: "positional" as const, description: "Server name", required: true },
        command: { type: "string" as const, description: "Binary for a stdio server" },
        args: {
          type: "string" as const,
          description: "Space-separated arguments for a stdio server",
        },
        env: { type: "string" as const, description: "Comma-separated K=V environment variables" },
        url: { type: "string" as const, description: "URL for an http/sse server" },
        scope: { type: "string" as const, description: "user (default) or project" },
        ...formatArgs,
      },
      run({ args }) {
        const env = args.env
          ? Object.fromEntries(
              args.env
                .split(",")
                .map((pair) => pair.split(/=(.*)/s))
                .filter((pair) => pair[0])
                .map((pair) => [pair[0] as string, pair[1] ?? ""]),
            )
          : undefined;
        const result = mcpAdd(
          requireHarnessId(args.id as string),
          {
            name: args.name as string,
            ...(args.command ? { command: args.command } : {}),
            ...(args.args ? { args: args.args.split(" ").filter(Boolean) } : {}),
            ...(env ? { env } : {}),
            ...(args.url ? { url: args.url } : {}),
          },
          args.scope === "project" ? "project" : "user",
        );
        report(result, args);
      },
    }),
    sync: defineCommand({
      meta: {
        description: "Reset harness configs to the master list from ~/.config/agntn/mcp.jsonc",
      },
      args: {
        id: { type: "positional" as const, description: "Harness id", required: false },
        ...formatArgs,
      },
      run({ args }) {
        const id = args.id === undefined ? undefined : requireHarnessId(args.id as string);
        report(mcpSync(id), args);
      },
    }),
    remove: defineCommand({
      meta: { description: "Remove one MCP server from a harness config" },
      args: {
        id: { type: "positional" as const, description: "Harness id", required: true },
        name: { type: "positional" as const, description: "Server name", required: true },
        scope: { type: "string" as const, description: "user (default) or project" },
        ...formatArgs,
      },
      run({ args }) {
        report(
          mcpRemove(
            requireHarnessId(args.id as string),
            args.name as string,
            args.scope === "project" ? "project" : "user",
          ),
          args,
        );
      },
    }),
  },
});
