/** Vercel AI SDK tools over the same definitions MCP, Pi, OMP and the CLI read. */

import { toAiTools, type AiTools } from "@agntn/tools/ai";
import type { Tool } from "ai";
import { harnessesTools } from "./tools.ts";

/** Every harnesses tool under its MCP name. Spawns and writes ask first. */
export const harnessesAiTools: AiTools<typeof harnessesTools> = /* @__PURE__ */ askBeforeEffects();

/**
 * Builds the map with `needsApproval` on every tool whose effect isn't a read.
 * @returns {AiTools<typeof harnessesTools>} The AI SDK tools.
 */
function askBeforeEffects(): AiTools<typeof harnessesTools> {
  const tools: Readonly<Record<string, Tool>> = toAiTools(harnessesTools);
  return Object.fromEntries(
    harnessesTools.map(({ name, effect }) => {
      const tool = tools[name];
      return [name, effect === "read" ? tool : { ...tool, needsApproval: true }];
    }),
  ) as AiTools<typeof harnessesTools>;
}
