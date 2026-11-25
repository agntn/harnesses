import { defineTool, Type } from "@agntn/tools";
import type { McpServerParams } from "../tool-operations.ts";
import { harnessToolSchemas } from "../tool-schemas.ts";

const { properties } = harnessToolSchemas().mcpAdd;

/**
 * @param env - Comma-separated `K=V` pairs.
 * @returns {Record<string, string>} The variables, a pair without `=` set to "".
 */
function parseEnv(env: string): Record<string, string> {
  return Object.fromEntries(
    env
      .split(",")
      .map((pair) => pair.split(/=(.*)/s))
      .filter((pair) => pair[0])
      .map((pair) => [pair[0] as string, pair[1] ?? ""]),
  );
}

/** The tool's schema, with `--args` and `--env` as words a shell can type. */
export default defineTool({
  name: "harnesses_mcp_add",
  title: "Add MCP Server",
  description: "Add or replace one MCP server in a harness config",
  effect: "destructive",
  idempotent: true,
  input: Type.Object(
    {
      ...properties,
      args: Type.Optional(
        Type.String({ description: "Space-separated arguments for a stdio server" }),
      ),
      env: Type.Optional(Type.String({ description: "Comma-separated K=V environment variables" })),
    },
    { additionalProperties: false },
  ),
  cli: { command: "mcp-servers add", positional: ["id", "name"], plain: ["id", "name"] },
  async execute(input) {
    const { id, scope, args, env, ...server } = input;
    const { mcpAdd } = await import("../tool-operations.ts");
    return mcpAdd(
      id,
      {
        ...(server satisfies Omit<McpServerParams, "args" | "env">),
        ...(args ? { args: args.split(" ").filter(Boolean) } : {}),
        ...(env ? { env: parseEnv(env) } : {}),
      },
      scope,
    );
  },
});
