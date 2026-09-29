import { defineCommand } from "citty";
import { consola, LogLevels } from "consola";
import { exitOnClosedPipe } from "./output.ts";

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
   *
   * The SDK's stdio transport never watches for the end of stdin, so a client
   * that exits would leave an in-flight `harnesses_run` going until its own
   * deadline. Closing the server aborts every pending request signal, which
   * stops each run's process group the same way a cancellation does, and the
   * process then exits once that cleanup has nothing left to wait for. A
   * write to a stdout the client already closed means the same, so it closes
   * the server too instead of exiting past that cleanup.
   */
  async run() {
    consola.level = LogLevels.warn;

    const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([
      import("../mcp.ts"),
      import("@modelcontextprotocol/sdk/server/stdio.js"),
    ]);
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
    process.stdin.once("end", () => void server.close());
    process.stdout
      .off("error", exitOnClosedPipe)
      .on("error", (error: Readonly<NodeJS.ErrnoException>) => {
        if (error.code !== "EPIPE") throw error;
        void server.close();
      });
  },
});
