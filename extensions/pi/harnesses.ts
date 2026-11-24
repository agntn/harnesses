import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { registerPiTools, type PiRenderers } from "@agntn/tools/pi";

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

const sourceModuleUrl = new URL("../../src/tools.ts", import.meta.url);
const distributionModuleUrl = new URL("../../dist/tools.mjs", import.meta.url);

/**
 * The same definitions MCP serves: current source in a checkout, the build in the package.
 *
 * @returns {Promise<typeof HarnessToolList>} The shared tool list module.
 */
async function loadTools(): Promise<typeof HarnessToolList> {
  const url = existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl : distributionModuleUrl;
  return (await import(url.href)) as typeof HarnessToolList;
}

function statusRenderers(tool: HarnessToolName): PiRenderers {
  return {
    renderCall(args: unknown, theme: StatusTheme, context: RenderOptions) {
      return new Text(renderToolCall(tool, args, context, theme), 0, 0);
    },
    renderResult(
      result: RenderedToolResult,
      options: RenderOptions,
      theme: StatusTheme,
      context?: Readonly<{ isError?: boolean }>,
    ) {
      return new Text(
        renderToolResult(tool, result, context?.isError === true, options, theme),
        0,
        0,
      );
    },
  };
}

const modelSection = "active_session_model";

type SessionModel = Readonly<{ provider: string; id: string }>;

function modelGuidance(model: SessionModel | undefined): string {
  const selection = model
    ? JSON.stringify(`${model.provider}/${model.id}`).replaceAll("<", "\\u003c")
    : "unknown";
  return [
    `Pi's selected model for this request: ${selection}.`,
    "No need to check environment variables or list models to find it.",
    "For independent advice via harnesses_run, pick a known different model explicitly.",
    "A different harness or alias for the same model doesn't count. Skip the consultation if no alternative is known.",
  ].join("\n");
}

export default async function harnessesExtension(pi: ExtensionAPI): Promise<void> {
  pi.on("before_agent_start", (event, ctx) => {
    const guidance = modelGuidance(ctx.model);
    if (event.systemPromptOptions?.sections) {
      event.systemPromptOptions.sections[modelSection] = guidance;
      return undefined;
    }
    return { systemPrompt: `${event.systemPrompt}\n\n${guidance}` };
  });

  pi.on("context_with_system", (event, ctx) => {
    for (let index = event.messages.length - 1; index >= 0; index--) {
      const message = event.messages[index];
      if (message?.role !== "system" || !Object.hasOwn(message.sections ?? {}, modelSection)) {
        continue;
      }
      const section = `<${modelSection}>\n${modelGuidance(ctx.model)}\n</${modelSection}>`;
      if (message.sections?.[modelSection] === section) return undefined;

      const messages = event.messages.slice();
      messages[index] = { ...message, sections: { ...message.sections, [modelSection]: section } };
      return { messages };
    }
    return undefined;
  });

  const { harnessesTools } = await loadTools();
  registerPiTools(pi, harnessesTools, {
    failures: "return",
    renderers: Object.fromEntries(harnessToolNames.map((name) => [name, statusRenderers(name)])),
  });
}
