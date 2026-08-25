import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type * as HarnessTools from "../../../dist/tool-operations.d.mts";

const sourceModuleUrl = new URL("../../../src/tool-operations.ts", import.meta.url);
const distributionModuleUrl = new URL("../../../dist/tool-operations.mjs", import.meta.url);
let toolOperationsPromise: Promise<typeof HarnessTools> | undefined;

/**
 * Loads the tool executors shared with the OMP extension, so the tool answers
 * stay identical across surfaces.
 */
function loadToolOperations(): Promise<typeof HarnessTools> {
  toolOperationsPromise ??= import(
    existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl.href : distributionModuleUrl.href
  ) as Promise<typeof HarnessTools>;

  return toolOperationsPromise;
}

export default function harnessesExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "harnesses_detect",
    label: "Harnesses Detect",
    description: "List every known AI coding harness with its install state and version",
    promptSnippet: "Use harnesses_detect to see which AI coding harnesses are installed.",
    promptGuidelines: ["The scan checks each harness's binaries on PATH and reads their versions."],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params): Promise<AgentToolResult<HarnessTools.HarnessListing>> {
      const { detectHarnesses } = await loadToolOperations();
      const { content, details } = detectHarnesses();
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_info",
    label: "Harnesses Info",
    description:
      "Full metadata for one AI coding harness: config, session, instruction, skill, command, and hook paths, plus paths resolved for this platform",
    promptSnippet: "Use harnesses_info to look up where a coding harness stores its data.",
    promptGuidelines: [
      "Pass a harness id from harnesses_detect, e.g. claude, codex, or opencode.",
      "Resolved paths are absolute for the current platform and home directory.",
    ],
    parameters: Type.Object({
      id: Type.String({
        description: "Harness id",
        minLength: 1,
        maxLength: 50,
        pattern: "^[a-z][a-z0-9-]*$",
      }),
    }),
    async execute(
      _toolCallId,
      params,
    ): Promise<AgentToolResult<HarnessTools.HarnessMetadata | HarnessTools.UnknownHarness>> {
      const { harnessInfo } = await loadToolOperations();
      const { content, details } = harnessInfo(params.id);
      return { content, details };
    },
  });
}
