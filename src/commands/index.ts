import type { ToolDefinition } from "@agntn/tools";
import detect from "./detect.ts";
import info from "./info.ts";
import list from "./list.ts";
import mcpServersAdd from "./mcp-servers-add.ts";
import models from "./models.ts";
import paths from "./paths.ts";
import run from "./run.ts";

/** Commands only the CLI gets: listings for people and the harness's own exit code. */
export const cliCommands: readonly ToolDefinition[] = [
  list,
  detect,
  info,
  paths,
  models,
  run,
  mcpServersAdd,
];
