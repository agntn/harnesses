import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-coding-agent";
import { registerOmpTools, type OmpRenderers } from "@agntn/tools/omp";

import type * as HarnessToolList from "../../dist/tools.d.mts";
import {
  harnessToolNames,
  type HarnessToolName,
  type RenderedToolResult,
  type RenderOptions,
  renderToolCall,
  renderToolResult,
  type StatusTheme,
} from "../shared/tui.ts";

/**
 * The same definitions MCP serves. Both specifiers stay literal on purpose:
 * OMP's compiled loader rewrites bare dependencies only for imports it can
 * see statically.
 *
 * @returns {Promise<typeof HarnessToolList>} The shared tool list module.
 */
async function loadTools(): Promise<typeof HarnessToolList> {
  const sourceModulePath = fileURLToPath(new URL("../../src/tools.ts", import.meta.url));
  return existsSync(sourceModulePath)
    ? ((await import("../../src/tools.ts")) as unknown as typeof HarnessToolList)
    : ((await import("../../dist/tools.mjs")) as typeof HarnessToolList);
}

export default async function harnessesExtension(pi: ExtensionAPI): Promise<void> {
  pi.setLabel("Harnesses");

  function statusRenderers(tool: HarnessToolName): OmpRenderers {
    return {
      renderCall(args: unknown, options: RenderOptions, theme: StatusTheme) {
        return new Text(renderToolCall(tool, args, options, theme), 0, 0);
      },
      renderResult(result: RenderedToolResult, options: RenderOptions, theme: StatusTheme) {
        return new Text(
          renderToolResult(tool, result, result.isError === true, options, theme),
          0,
          0,
        );
      },
    };
  }

  const { harnessesTools } = await loadTools();
  registerOmpTools(pi, harnessesTools, {
    Text,
    loadMode: "essential",
    renderers: Object.fromEntries(harnessToolNames.map((name) => [name, statusRenderers(name)])),
  });
}
