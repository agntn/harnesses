/** Vercel AI SDK tools over the same definitions MCP, Pi, OMP and the CLI read. */

import { toAiTools, type AiTools } from "@agntn/tools/ai";
import { harnessesTools } from "./tools.ts";

/** Every harnesses tool under its MCP name. Spawns and writes ask first. */
export const harnessesAiTools: AiTools<typeof harnessesTools> =
  /* @__PURE__ */ toAiTools(harnessesTools);
