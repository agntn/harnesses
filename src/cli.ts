#!/usr/bin/env node

import { existsSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import type * as McpCommand from "./commands/mcp.ts";
import { version } from "./types.ts";

/**
 * Narrows a runtime URL import, which TypeScript types as `any`.
 *
 * @param value - The imported module namespace.
 * @returns {boolean} Whether it exports `serveMcp`.
 */
function isMcpModule(value: unknown): value is typeof McpCommand {
  return typeof value === "object" && value !== null && "serveMcp" in value;
}

/**
 * Inside a checkout, `mcp` runs from `src/`: a restart beats a rebuild.
 *
 * @returns {Promise<typeof McpCommand>} The module that starts the stdio server.
 */
async function loadMcpCommand(): Promise<typeof McpCommand> {
  const source = new URL("../src/commands/mcp.ts", import.meta.url);
  const sourcePath = fileURLToPath(source);
  const fromSource =
    !import.meta.url.endsWith(".ts") &&
    process.env.HARNESSES_DIST !== "1" &&
    process.features.typescript !== false &&
    !sourcePath.includes(`${sep}node_modules${sep}`) &&
    existsSync(sourcePath);
  if (!fromSource) return import("./commands/mcp.ts");
  const module: unknown = await import(source.href);
  if (!isMcpModule(module)) throw new TypeError(`${sourcePath} has no serveMcp`);
  return module;
}

const argv = process.argv.slice(2);

/** A stray flag in an MCP client's config must not kill the server, so `mcp` takes any but help. */
if (argv[0] === "mcp" && !argv.includes("--help") && !argv.includes("-h")) {
  await (await loadMcpCommand()).serveMcp();
} else {
  const [{ runCli }, { harnessesTools }, { cliCommands }] = await Promise.all([
    import("@agntn/tools/cli"),
    import("./tools.ts"),
    import("./commands/index.ts"),
  ]);
  await runCli(
    {
      name: "harnesses",
      version,
      description: "Metadata toolkit for AI coding harnesses",
      tools: harnessesTools,
      commands: cliCommands,
      groups: {
        "mcp-servers": { description: "Manage MCP servers across harness configs" },
        agents: { description: "Manage the shared global instructions file across harnesses" },
        prompts: { description: "Manage shared prompt templates across harnesses" },
        skills: { description: "Manage shared skills across harnesses" },
      },
      mcp: true,
    },
    argv,
  );
}
