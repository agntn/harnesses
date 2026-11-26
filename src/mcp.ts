import { createMcpServer as createToolServer } from "@agntn/tools/mcp";
import type { Server } from "@modelcontextprotocol/server";
import { sourceChangeCheck } from "./source-change.ts";
import { harnessesTools } from "./tools.ts";
import { version } from "./types.ts";

export { harnessesTools } from "./tools.ts";

const serverInfo = { name: "harnesses", version } as const;

const RESTART = "src/ changed under this server, restart it to load the new code";

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
  const changed = sourceChanged;
  if (!changed) return createToolServer(serverInfo, harnessesTools);
  return createToolServer(serverInfo, harnessesTools, {
    refuse: () => (changed() ? RESTART : undefined),
  });
}
