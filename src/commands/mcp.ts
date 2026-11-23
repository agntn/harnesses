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
   *
   * `serveStdio` answers 2025 and 2026 clients alike. A closed stdin or stdout
   * closes the server, which aborts each pending run. `exitOnClosedPipe` would
   * exit first, so it goes.
   */
  async run() {
    consola.level = LogLevels.warn;

    const [{ createMcpServer }, { serveStdio }] = await Promise.all([
      import("../mcp.ts"),
      import("@modelcontextprotocol/server/stdio"),
    ]);
    process.stdout.removeAllListeners("error");
    serveStdio(() => createMcpServer());
  },
});
