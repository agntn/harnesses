import { defineCommand } from "citty";
import { consola, LogLevels } from "consola";

export default defineCommand({
  meta: {
    name: "mcp",
    description: "Run the harnesses MCP server over stdio",
  },
  /**
   * The server and the SDK load here, because citty resolves every subcommand
   * to print `harnesses --help` and to look for an alias of an unknown command.
   *
   * stdout carries the JSON-RPC frames. consola's default reporter sends
   * anything at log level or below to that same descriptor, and `DEBUG` in the
   * environment raises the level on import, so one stray line would corrupt
   * the stream. Warnings and errors still reach stderr.
   */
  async run() {
    consola.level = LogLevels.warn;

    const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([
      import("../mcp.ts"),
      import("@modelcontextprotocol/sdk/server/stdio.js"),
    ]);
    await createMcpServer().connect(new StdioServerTransport());
  },
});
