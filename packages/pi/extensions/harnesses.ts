import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";

import type * as HarnessTools from "../../../dist/tool-operations.d.mts";
// Schemas must exist synchronously at registration, so unlike the executors
// below they load from dist; `pnpm build` keeps it current in the checkout.
import { harnessToolSchemas } from "../../../dist/tool-schemas.mjs";
import type * as HarnessSchemas from "../../../dist/tool-schemas.d.mts";

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
  const schemas = harnessToolSchemas<TSchema, TSchema>(Type);

  pi.registerTool({
    name: "harnesses_detect",
    label: "Harnesses Detect",
    description: "List every known AI coding harness with its install state and version",
    promptSnippet: "Use harnesses_detect to see which AI coding harnesses are installed.",
    promptGuidelines: ["The scan checks each harness's binaries on PATH and reads their versions."],
    parameters: schemas.detect,
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
      "Full metadata for one AI coding harness, including supported invocation and model operations, configuration, sessions, instructions, skills, commands, hooks, and resolved paths",
    promptSnippet: "Use harnesses_info to look up where a coding harness stores its data.",
    promptGuidelines: [
      "Pass a harness id from harnesses_detect, e.g. claude, codex, or opencode.",
      "Resolved paths are absolute for the current platform and home directory.",
    ],
    parameters: schemas.info,
    async execute(
      _toolCallId,
      params: HarnessSchemas.InfoParams,
    ): Promise<AgentToolResult<HarnessTools.HarnessMetadata | HarnessTools.UnknownHarness>> {
      const { harnessInfo } = await loadToolOperations();
      const { content, details } = harnessInfo(params.id);
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_models",
    label: "Harnesses Models",
    description:
      "List the models currently available to one AI coding harness through its native CLI",
    promptSnippet:
      "Use harnesses_models to inspect models available to an installed coding harness.",
    promptGuidelines: [
      "An optional search filter is passed only to harnesses that support native filtering.",
      "The harness command may load configuration and extensions from cwd.",
    ],
    parameters: schemas.models,
    async execute(
      _toolCallId,
      params: HarnessSchemas.ModelsParams,
    ): Promise<AgentToolResult<HarnessTools.ModelsOutcome | HarnessTools.RunFailure>> {
      const { listHarnessModels } = await loadToolOperations();
      const { content, details, isError } = await listHarnessModels(params.id, {
        search: params.search,
        cwd: params.cwd,
        timeoutSeconds: params.timeoutSeconds,
      });
      if (isError) {
        const message =
          "error" in details
            ? details.error
            : details.timedOut
              ? `Harness ${details.id} model listing timed out`
              : details.stderr || `Harness ${details.id} exited with code ${details.exitCode}`;
        throw new Error(message);
      }
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_run",
    label: "Harnesses Run",
    description:
      "Run one prompt through an AI coding harness's normalized non-interactive invocation, optionally selecting a model, and return its output",
    promptSnippet: "Use harnesses_run to delegate one prompt to another installed coding harness.",
    promptGuidelines: [
      "Always choose tools explicitly. Set true whenever the task needs harness tools, including Grok native X search.",
      "Set false only for an advisor without tools. It never silently falls back to a full agent.",
      "An unsupported mode returns an explicit retry when the alternate mode is available.",
      "Output is capped for context; long runs stop at the timeout.",
    ],
    parameters: schemas.run,
    async execute(
      _toolCallId,
      params: HarnessSchemas.RunParams,
    ): Promise<AgentToolResult<HarnessTools.RunOutcome | HarnessTools.RunFailure>> {
      const { runHarness } = await loadToolOperations();
      const { content, details, isError } = await runHarness(params.id, params.prompt, {
        cwd: params.cwd,
        model: params.model,
        timeoutSeconds: params.timeoutSeconds,
        structured: params.structured,
        tools: params.tools,
      });
      if (isError) {
        const message =
          "error" in details
            ? details.error
            : details.timedOut
              ? `Harness ${details.id} timed out`
              : details.stderr || `Harness ${details.id} exited with code ${details.exitCode}`;
        throw new Error(message);
      }
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_list",
    label: "Harnesses MCP List",
    description:
      "List the MCP servers configured in each harness's config files, normalized across dialects",
    promptSnippet:
      "Use harnesses_mcp_list to see which MCP servers each coding harness has configured.",
    promptGuidelines: ["Omit id to scan every harness."],
    parameters: schemas.mcpList,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpListParams,
    ): Promise<AgentToolResult<HarnessTools.McpListing | HarnessTools.UnknownHarness>> {
      const { mcpList } = await loadToolOperations();
      const { content, details } = mcpList(params.id);
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_add",
    label: "Harnesses MCP Add",
    description:
      "Add or replace one MCP server in a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpAdd,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpAddParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpAdd } = await loadToolOperations();
      const { content, details } = mcpAdd(params.id, params, params.scope ?? "user");
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_sync",
    label: "Harnesses MCP Sync",
    description:
      "Reset every harness's user-scope MCP config to exactly the master list from ~/.config/agntn/mcp.jsonc; extras are removed and master-listed names are withdrawn from excluded harnesses",
    parameters: schemas.mcpSync,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpSyncParams,
    ): Promise<AgentToolResult<HarnessTools.SyncReport | HarnessTools.RunFailure>> {
      const { mcpSync } = await loadToolOperations();
      const { content, details } = mcpSync(params.id);
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_agents_sync",
    label: "Harnesses Agents Sync",
    description:
      "Link every harness's global instructions file to the master agents file; diverged copies are backed up and relinked. Pass check to only report",
    parameters: schemas.agentsSync,
    async execute(
      _toolCallId,
      params: HarnessSchemas.AgentsSyncParams,
    ): Promise<AgentToolResult<HarnessTools.AgentsSyncReport | HarnessTools.RunFailure>> {
      const { agentsSync } = await loadToolOperations();
      const { content, details } = agentsSync(params.id, params.check === true);
      return { content, details };
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_remove",
    label: "Harnesses MCP Remove",
    description:
      "Remove one MCP server from a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpRemove,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpRemoveParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpRemove } = await loadToolOperations();
      const { content, details } = mcpRemove(params.id, params.name, params.scope ?? "user");
      return { content, details };
    },
  });
}
