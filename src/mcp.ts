import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Type, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { detectHarnesses, harnessInfo, type ToolResult } from "./tool-operations.ts";
import { version } from "./types.ts";

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: TSchema;
  execute(args: Record<string, unknown>): ToolResult<unknown>;
}

const tools: ToolDefinition[] = [
  {
    name: "harnesses_detect",
    title: "Harnesses Detect",
    description:
      "List every known AI coding harness with its install state and version, scanned from the binaries on PATH.",
    inputSchema: Type.Object({}),
    execute: () => detectHarnesses(),
  },
  {
    name: "harnesses_info",
    title: "Harnesses Info",
    description:
      "Full metadata for one AI coding harness: config, session, instruction, skill, command, and hook paths, plus paths resolved for this platform.",
    inputSchema: Type.Object({
      id: Type.String({
        description: "Harness id",
        minLength: 1,
        maxLength: 50,
        pattern: "^[a-z][a-z0-9-]*$",
      }),
    }),
    execute: (args) => harnessInfo(args.id as string),
  },
];

/** Formats the first TypeBox validation failure for an MCP client. */
function validationError(schema: TSchema, value: unknown): string {
  const first = Value.Errors(schema, value)[0];
  if (!first) return "Invalid arguments";
  return `Invalid arguments at ${first.instancePath || "/"}: ${first.message}`;
}

/**
 * Wraps error text for the MCP client, replacing control bytes with spaces.
 *
 * Every error branch goes through here because parts of these messages echo
 * client-controlled values (a tool name, an argument) or downstream error
 * messages: one raw newline or escape byte would forge extra lines that read
 * as the server's own answer.
 */
function errorResult(text: string): CallToolResult {
  return {
    content: [{ type: "text", text: text.replace(/\p{Cc}/gu, " ") }],
    isError: true,
  };
}

/**
 * Converts a shared tool result to the MCP text-result contract.
 *
 * `details` is dropped and `structuredContent` is never set: clients that see
 * structured output prefer it over `content` and would hide the readable answer.
 */
function toCallToolResult(result: ToolResult<unknown>): CallToolResult {
  return {
    content: result.content,
    ...(result.isError === undefined ? {} : { isError: result.isError }),
  };
}

/**
 * Creates an unconnected MCP server exposing the harness registry tools.
 *
 * Built on the low-level `Server` even though the SDK marks it `@deprecated`,
 * because `McpServer.registerTool` accepts Standard Schema (Zod) only. TypeBox 1.x
 * does not implement Standard Schema, and this package's tool schemas are TypeBox,
 * shared with the Pi and OMP extensions. The high-level API would force a second
 * definition of every parameter.
 */
export function createMcpServer(): Server {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const server = new Server({ name: "harnesses", version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(
      (tool): Tool => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as Tool["inputSchema"],
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      }),
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const tool = toolsByName.get(request.params.name);
    if (!tool) {
      return errorResult(`Unknown harnesses tool: ${JSON.stringify(request.params.name)}`);
    }

    const args = request.params.arguments ?? {};
    if (!Value.Check(tool.inputSchema, args)) {
      return errorResult(validationError(tool.inputSchema, args));
    }

    try {
      return toCallToolResult(tool.execute(args));
    } catch (error) {
      return errorResult(
        `${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return server;
}
