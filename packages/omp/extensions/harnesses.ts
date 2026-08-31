import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-coding-agent";
import type { TSchema } from "@oh-my-pi/pi-ai";
import type { AnySchema } from "@oh-my-pi/omptype/typebox";

import type * as HarnessTools from "../../../dist/tool-operations.d.mts";
import {
  HARNESS_TOOL_APPROVALS,
  HARNESS_TOOL_LABELS,
  type HarnessToolName,
  type RenderedToolResult,
  type RenderOptions,
  renderToolCall,
  renderToolResult,
  type StatusTheme,
} from "../../shared/tui.ts";
// Schemas must exist synchronously at registration, so unlike the executors
// below they load from dist; `pnpm build` keeps it current in the checkout.
import { harnessToolSchemas } from "../../../dist/tool-schemas.mjs";
import type * as HarnessSchemas from "../../../dist/tool-schemas.d.mts";

const sourceModulePath = fileURLToPath(new URL("../../../src/tool-operations.ts", import.meta.url));
let toolOperationsPromise: Promise<typeof HarnessTools> | undefined;

/**
 * Loads the tool executors shared with the Pi extension, so the tool answers
 * stay identical across surfaces. Both specifiers stay literal on purpose:
 * OMP's compiled loader rewrites bare dependencies only for imports it can
 * see statically.
 *
 * @returns {Promise<typeof HarnessTools>} The shared executor module.
 */
function loadToolOperations(): Promise<typeof HarnessTools> {
  toolOperationsPromise ??= (
    existsSync(sourceModulePath)
      ? import("../../../src/tool-operations.ts")
      : import("../../../dist/tool-operations.mjs")
  ) as Promise<typeof HarnessTools>;

  return toolOperationsPromise;
}

function statusRenderers(tool: HarnessToolName) {
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

export default function harnessesExtension(pi: ExtensionAPI): void {
  // OMP validates tool parameters with its own TypeBox build, so schemas must
  // come from the host-injected facade rather than a standalone typebox import.
  const schemas = harnessToolSchemas<AnySchema, TSchema>(pi.typebox.Type);
  pi.setLabel("Harnesses");

  pi.registerTool({
    name: "harnesses_detect",
    label: HARNESS_TOOL_LABELS.harnesses_detect,
    description: "List every known AI coding harness with its install state and version",
    parameters: schemas.detect,
    approval: HARNESS_TOOL_APPROVALS.harnesses_detect,
    async execute(_toolCallId, _params): Promise<AgentToolResult<HarnessTools.HarnessListing>> {
      const { detectHarnesses } = await loadToolOperations();
      const { content, details } = detectHarnesses();
      return { content, details };
    },
    ...statusRenderers("harnesses_detect"),
  });

  pi.registerTool({
    name: "harnesses_info",
    label: HARNESS_TOOL_LABELS.harnesses_info,
    description:
      "Full metadata for one or more AI coding harnesses, including supported invocation and model operations, configuration, sessions, instructions, skills, commands, hooks, and resolved paths",
    parameters: schemas.info,
    approval: HARNESS_TOOL_APPROVALS.harnesses_info,
    async execute(
      _toolCallId,
      params: HarnessSchemas.InfoParams,
    ): Promise<AgentToolResult<HarnessTools.HarnessInfoDetails>> {
      const { harnessInfo } = await loadToolOperations();
      const { content, details } = harnessInfo(params.id);
      return { content, details };
    },
    ...statusRenderers("harnesses_info"),
  });

  pi.registerTool({
    name: "harnesses_models",
    label: HARNESS_TOOL_LABELS.harnesses_models,
    description:
      "List the models currently available to one AI coding harness through its native CLI",
    parameters: schemas.models,
    approval: HARNESS_TOOL_APPROVALS.harnesses_models,
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
    ...statusRenderers("harnesses_models"),
  });

  pi.registerTool({
    name: "harnesses_run",
    label: HARNESS_TOOL_LABELS.harnesses_run,
    description:
      "Run one prompt through a harness. Always choose tools explicitly. Add readOnly when tools is true to require native read-only enforcement, or use tools false for an advisor without tools.",
    parameters: schemas.run,
    approval: HARNESS_TOOL_APPROVALS.harnesses_run,
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
        readOnly: params.readOnly,
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
    ...statusRenderers("harnesses_run"),
  });

  pi.registerTool({
    name: "harnesses_mcp_list",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_list,
    description:
      "List the MCP servers configured in each harness's config files, normalized across dialects",
    parameters: schemas.mcpList,
    approval: HARNESS_TOOL_APPROVALS.harnesses_mcp_list,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpListParams,
    ): Promise<AgentToolResult<HarnessTools.McpListing | HarnessTools.UnknownHarness>> {
      const { mcpList } = await loadToolOperations();
      const { content, details } = mcpList(params.id);
      return { content, details };
    },
    ...statusRenderers("harnesses_mcp_list"),
  });

  pi.registerTool({
    name: "harnesses_mcp_add",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_add,
    description:
      "Add or replace one MCP server in a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpAdd,
    approval: HARNESS_TOOL_APPROVALS.harnesses_mcp_add,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpAddParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpAdd } = await loadToolOperations();
      const { content, details } = mcpAdd(params.id, params, params.scope ?? "user");
      return { content, details };
    },
    ...statusRenderers("harnesses_mcp_add"),
  });

  pi.registerTool({
    name: "harnesses_mcp_sync",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_sync,
    description:
      "Reset every harness's user-scope MCP config to exactly the master list from ~/.config/agntn/mcp.jsonc; extras are removed and master-listed names are withdrawn from excluded harnesses",
    parameters: schemas.mcpSync,
    approval: HARNESS_TOOL_APPROVALS.harnesses_mcp_sync,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpSyncParams,
    ): Promise<AgentToolResult<HarnessTools.SyncReport | HarnessTools.RunFailure>> {
      const { mcpSync } = await loadToolOperations();
      const { content, details } = mcpSync(params.id);
      return { content, details };
    },
    ...statusRenderers("harnesses_mcp_sync"),
  });

  pi.registerTool({
    name: "harnesses_agents_sync",
    label: HARNESS_TOOL_LABELS.harnesses_agents_sync,
    description:
      "Link every harness's global instructions file and declared companions to the master bundle; diverged copies are backed up and relinked. Pass check to only report",
    parameters: schemas.agentsSync,
    approval: HARNESS_TOOL_APPROVALS.harnesses_agents_sync,
    async execute(
      _toolCallId,
      params: HarnessSchemas.AgentsSyncParams,
    ): Promise<AgentToolResult<HarnessTools.AgentsSyncReport | HarnessTools.RunFailure>> {
      const { agentsSync } = await loadToolOperations();
      const { content, details } = agentsSync(params.id, params.check === true);
      return { content, details };
    },
    ...statusRenderers("harnesses_agents_sync"),
  });

  pi.registerTool({
    name: "harnesses_mcp_remove",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_remove,
    description:
      "Remove one MCP server from a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpRemove,
    approval: HARNESS_TOOL_APPROVALS.harnesses_mcp_remove,
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpRemoveParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpRemove } = await loadToolOperations();
      const { content, details } = mcpRemove(params.id, params.name, params.scope ?? "user");
      return { content, details };
    },
    ...statusRenderers("harnesses_mcp_remove"),
  });
}
