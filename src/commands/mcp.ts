/**
 * Serves MCP over stdio. A closed stdin or stdout aborts each pending run.
 *
 * @returns {Promise<void>} Once the server is connected.
 */
export async function serveMcp(): Promise<void> {
  const [{ createMcpServer }, { serveStdio }] = await Promise.all([
    import("../mcp.ts"),
    import("@modelcontextprotocol/server/stdio"),
  ]);
  serveStdio(() => createMcpServer());
}
