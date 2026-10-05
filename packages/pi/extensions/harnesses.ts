import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type TSchema } from "typebox";

import type * as HarnessTools from "../../../dist/tool-operations.d.mts";
import {
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

const sourceModuleUrl = new URL("../../../src/tool-operations.ts", import.meta.url);
const distributionModuleUrl = new URL("../../../dist/tool-operations.mjs", import.meta.url);
let toolOperationsPromise: Promise<typeof HarnessTools> | undefined;

/**
 * Loads the tool executors shared with the OMP extension, so the tool answers
 * stay identical across surfaces.
 *
 * @returns {Promise<typeof HarnessTools>} The shared executor module.
 */
function loadToolOperations(): Promise<typeof HarnessTools> {
  toolOperationsPromise ??= import(
    existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl.href : distributionModuleUrl.href
  ) as Promise<typeof HarnessTools>;

  return toolOperationsPromise;
}

function prepareInfoArguments(args: unknown): unknown {
  if (typeof args !== "object" || args === null || !("id" in args) || typeof args.id !== "string") {
    return args;
  }

  try {
    const id: unknown = JSON.parse(args.id);
    return Array.isArray(id) && id.every((value) => typeof value === "string")
      ? { ...args, id }
      : args;
  } catch {
    return args;
  }
}

function statusRenderers(tool: HarnessToolName) {
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

export default function harnessesExtension(pi: ExtensionAPI): void {
  const schemas = harnessToolSchemas<TSchema, TSchema>(Type);

  pi.registerTool({
    name: "harnesses_detect",
    label: HARNESS_TOOL_LABELS.harnesses_detect,
    description:
      "List every known AI coding harness with its install state, version and the harnesses_run modes it takes: advisor (tools=false), readOnly (tools=true with readOnly=true) and agent (tools=true)",
    promptSnippet:
      "Use harnesses_detect to see which AI coding harnesses are installed and how each one runs.",
    promptGuidelines: [
      "The scan checks binaries on PATH. Versions come from native metadata or the CLI.",
      "advisor, readOnly and agent say whether harnesses_run takes tools false, tools true with readOnly, or tools true for that harness.",
    ],
    parameters: schemas.detect,
    ...statusRenderers("harnesses_detect"),
    async execute(_toolCallId, _params): Promise<AgentToolResult<HarnessTools.HarnessListing>> {
      const { detectHarnesses } = await loadToolOperations();
      return detectHarnesses();
    },
  });

  pi.registerTool({
    name: "harnesses_info",
    label: HARNESS_TOOL_LABELS.harnesses_info,
    description:
      "Full metadata for one or more AI coding harnesses, including supported invocation and model operations, whether a read-only run keeps its network, configuration, sessions, instructions, skills, commands, prompt templates, hooks, temp directories, the env variables that move them, and resolved paths",
    promptSnippet: "Use harnesses_info to look up where coding harnesses store their data.",
    promptGuidelines: [
      "Pass one harness id from harnesses_detect, or batch several ids in one call.",
      "Resolved paths are absolute for the current platform and home directory.",
    ],
    parameters: schemas.info,
    prepareArguments: prepareInfoArguments,
    ...statusRenderers("harnesses_info"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.InfoParams,
    ): Promise<AgentToolResult<HarnessTools.HarnessInfoDetails>> {
      const { harnessInfo } = await loadToolOperations();
      return harnessInfo(params.id);
    },
  });

  pi.registerTool({
    name: "harnesses_models",
    label: HARNESS_TOOL_LABELS.harnesses_models,
    description:
      "List the models currently available to one AI coding harness through its native CLI",
    promptSnippet:
      "Use harnesses_models to inspect models available to an installed coding harness.",
    promptGuidelines: [
      "An optional search filter is passed only to harnesses that support native filtering.",
      "The harness command may load configuration and extensions from cwd.",
    ],
    parameters: schemas.models,
    ...statusRenderers("harnesses_models"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.ModelsParams,
      signal,
    ): Promise<AgentToolResult<HarnessTools.ModelsOutcome | HarnessTools.RunFailure>> {
      const { listHarnessModels } = await loadToolOperations();
      return listHarnessModels(params.id, {
        search: params.search,
        cwd: params.cwd,
        timeoutSeconds: params.timeoutSeconds,
        signal,
      });
    },
  });

  pi.registerTool({
    name: "harnesses_run",
    label: HARNESS_TOOL_LABELS.harnesses_run,
    description:
      "Run one prompt through an AI coding harness's normalized non-interactive invocation, optionally selecting a model and reasoning effort, and return its output",
    promptSnippet: "Use harnesses_run to delegate one prompt to another installed coding harness.",
    promptGuidelines: [
      "Always choose tools explicitly. Set true whenever the task needs harness tools, including Grok native X search.",
      "Add readOnly when tools is true to require native read-only enforcement. Unsupported harnesses reject it instead of widening access.",
      "A run that needs the web checks readOnlyNetwork in harnesses_info first: false means its MCP servers get no network under readOnly.",
      "Set tools false only for an advisor without tools. It never silently falls back to a full agent.",
      "An unsupported mode returns an explicit retry when the alternate mode is available. harnesses_detect shows the modes up front.",
      "Output is capped for context; long runs stop at the timeout.",
    ],
    parameters: schemas.run,
    ...statusRenderers("harnesses_run"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.RunParams,
      signal,
    ): Promise<AgentToolResult<HarnessTools.RunOutcome | HarnessTools.RunFailure>> {
      const { runHarness } = await loadToolOperations();
      return runHarness(params.id, params.prompt, {
        cwd: params.cwd,
        model: params.model,
        effort: params.effort,
        timeoutSeconds: params.timeoutSeconds,
        signal,
        structured: params.structured,
        tools: params.tools,
        readOnly: params.readOnly,
      });
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_list",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_list,
    description:
      "List the MCP servers configured in each harness's config files, normalized across dialects",
    promptSnippet:
      "Use harnesses_mcp_list to see which MCP servers each coding harness has configured.",
    promptGuidelines: ["Omit id to scan every harness."],
    parameters: schemas.mcpList,
    ...statusRenderers("harnesses_mcp_list"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpListParams,
    ): Promise<AgentToolResult<HarnessTools.McpListing | HarnessTools.UnknownHarness>> {
      const { mcpList } = await loadToolOperations();
      return mcpList(params.id);
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_add",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_add,
    description:
      "Add or replace one MCP server in a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpAdd,
    ...statusRenderers("harnesses_mcp_add"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpAddParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpAdd } = await loadToolOperations();
      return mcpAdd(params.id, params, params.scope ?? "user");
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_sync",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_sync,
    description:
      "Reset every harness's user-scope MCP config to exactly the master list from ~/.config/agntn/mcp.jsonc; extras are removed unless the list's keep names them for that harness, and master-listed names are withdrawn from excluded harnesses",
    parameters: schemas.mcpSync,
    ...statusRenderers("harnesses_mcp_sync"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpSyncParams,
    ): Promise<AgentToolResult<HarnessTools.SyncReport | HarnessTools.RunFailure>> {
      const { mcpSync } = await loadToolOperations();
      return mcpSync(params.id);
    },
  });

  pi.registerTool({
    name: "harnesses_agents_sync",
    label: HARNESS_TOOL_LABELS.harnesses_agents_sync,
    description:
      "Link every harness's global instructions file and declared companions to the master bundle; diverged copies are backed up and relinked. Pass check to only report",
    parameters: schemas.agentsSync,
    ...statusRenderers("harnesses_agents_sync"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.AgentsSyncParams,
    ): Promise<AgentToolResult<HarnessTools.AgentsSyncReport | HarnessTools.RunFailure>> {
      const { agentsSync } = await loadToolOperations();
      return agentsSync(params.id, params.check === true);
    },
  });

  pi.registerTool({
    name: "harnesses_prompts_sync",
    label: HARNESS_TOOL_LABELS.harnesses_prompts_sync,
    description:
      "Sync canonical Markdown prompt templates from the agntn XDG data directory into supported harnesses; Gemini receives generated TOML. Diverged files are backed up. Pass check to only report",
    parameters: schemas.promptsSync,
    ...statusRenderers("harnesses_prompts_sync"),
    async execute(
      _toolCallId,
      params: Readonly<HarnessSchemas.PromptsSyncParams>,
    ): Promise<AgentToolResult<HarnessTools.PromptSyncReport | HarnessTools.RunFailure>> {
      const { promptsSync } = await loadToolOperations();
      return promptsSync(params.id, params.check === true);
    },
  });

  pi.registerTool({
    name: "harnesses_skills_sync",
    label: HARNESS_TOOL_LABELS.harnesses_skills_sync,
    description:
      "Link supported harness skills directories to the canonical skills directory in the agntn XDG data directory. Links to single skills are replaced; anything else is backed up. Pass check to only report",
    parameters: schemas.skillsSync,
    ...statusRenderers("harnesses_skills_sync"),
    async execute(
      _toolCallId,
      params: Readonly<HarnessSchemas.SkillsSyncParams>,
    ): Promise<AgentToolResult<HarnessTools.SkillsSyncReport | HarnessTools.RunFailure>> {
      const { skillsSync } = await loadToolOperations();
      return skillsSync(params.id, params.check === true);
    },
  });

  pi.registerTool({
    name: "harnesses_mcp_remove",
    label: HARNESS_TOOL_LABELS.harnesses_mcp_remove,
    description:
      "Remove one MCP server from a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpRemove,
    ...statusRenderers("harnesses_mcp_remove"),
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpRemoveParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpRemove } = await loadToolOperations();
      return mcpRemove(params.id, params.name, params.scope ?? "user");
    },
  });
}
