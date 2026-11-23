import { callTool, createMcpServer as createToolServer, errorResult } from "@agntn/tools/mcp";
import type { Server } from "@modelcontextprotocol/server";
import { sourceChangeCheck } from "./source-change.ts";
import { harnessesTools } from "./tools.ts";
import { version } from "./types.ts";

export { harnessesTools } from "./tools.ts";

const serverInfo = { name: "harnesses", version } as const;

const RESTART = "src/ changed under this server, restart it to load the new code";
const RAN =
  "src/ changed during this call, so its answer was dropped. It may have run: check before retrying, then restart the server";

/** Counted from process start, so a pull during the first imports counts. */
const sourceChanged = import.meta.url.endsWith(".ts")
  ? sourceChangeCheck(import.meta.dirname, performance.timeOrigin)
  : undefined;

/**
 * Creates an unconnected MCP server exposing the harness registry tools.
 * From `src/`, a call refuses once that tree changes.
 *
 * @returns {Server} An unconnected MCP server.
 */
export function createMcpServer(): Server {
  const server = createToolServer(serverInfo, harnessesTools);
  const changed = sourceChanged;
  if (!changed) return server;

  server.setRequestHandler("tools/call", async (request, ctx) => {
    if (changed()) return errorResult(RESTART);
    const { name, arguments: args } = request.params;
    const result = await callTool(serverInfo, harnessesTools, name, args, {
      signal: ctx.mcpReq.signal,
    });
    return changed() ? errorResult(RAN) : result;
  });
  return server;
}
