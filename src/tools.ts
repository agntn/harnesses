/** The harnesses tools, declared once for every host. Executors load on the first call. */

import {
  defineTool,
  Type,
  type TObject,
  type ToolCallContext,
  type ToolDefinition,
  type ToolResult,
  type TSchema,
} from "@agntn/tools";
import type { McpServerParams } from "./tool-operations.ts";
import {
  harnessToolSchemas,
  type AgentsSyncParams,
  type InfoParams,
  type McpAddParams,
  type McpListParams,
  type McpRemoveParams,
  type McpSyncParams,
  type ModelsParams,
  type PromptsSyncParams,
  type RunParams,
  type SkillsSyncParams,
} from "./tool-schemas.ts";

type ToolOperations = typeof import("./tool-operations.ts");

const schemas = harnessToolSchemas<TSchema, TObject>(Type);
let operationsPromise: Promise<ToolOperations> | undefined;

/**
 * Loads the executors on the first call.
 *
 * @returns {Promise<ToolOperations>} The shared executor module.
 */
function loadOperations(): Promise<ToolOperations> {
  operationsPromise ??= import("./tool-operations.ts");
  return operationsPromise;
}

/** A tool typed by its params interface, since the schema factory erases the static type. */
interface HarnessTool<Params> extends Omit<ToolDefinition, "execute"> {
  execute(input: Params, context: ToolCallContext): Promise<ToolResult>;
}

/**
 * Defines a tool over its parameter interface from `tool-schemas.ts`.
 *
 * @param tool - Definition with a typed executor.
 * @returns {ToolDefinition} The checked definition.
 */
function harnessTool<Params>(tool: HarnessTool<Params>): ToolDefinition {
  return defineTool({
    ...tool,
    execute: (input, context) => tool.execute(input as unknown as Params, context),
  });
}

/** The eleven harnesses tools, in `tools/list` order. */
export const harnessesTools: readonly ToolDefinition[] = [
  harnessTool<Record<string, never>>({
    name: "harnesses_detect",
    title: "Harnesses Detect",
    description:
      "List every known AI coding harness with its install state, version and the harnesses_run modes it takes: advisor (tools=false), readOnly (tools=true with readOnly=true) and agent (tools=true).",
    effect: "read",
    input: schemas.detect,
    execute: async () => (await loadOperations()).detectHarnesses(),
  }),
  harnessTool<InfoParams>({
    name: "harnesses_info",
    title: "Harnesses Info",
    description:
      "Full metadata for one or more AI coding harnesses, including supported invocation and model operations, whether a read-only run keeps its network and which tools, configuration, sessions, instructions, skills, commands, prompt templates, hooks, temp directories, the env variables that move them, and resolved paths.",
    effect: "read",
    input: schemas.info,
    execute: async (input) => (await loadOperations()).harnessInfo(input.id),
  }),
  harnessTool<ModelsParams>({
    name: "harnesses_models",
    title: "Harnesses Models",
    description:
      "List the models currently available to one AI coding harness through its native CLI, normalized across providers. An optional search filter is passed to harnesses that support it. The command may load project configuration and extensions.",
    effect: "exec",
    openWorld: true,
    input: schemas.models,
    async execute(input, { signal }) {
      const { id, ...options } = input;
      return (await loadOperations()).listHarnessModels(id, { ...options, signal });
    },
  }),
  harnessTool<RunParams>({
    name: "harnesses_run",
    title: "Harnesses Run",
    description:
      "Run one prompt through an AI coding harness's normalized non-interactive invocation and return its output. Pass tools=true whenever the task needs harness tools, including Grok native X search. Add readOnly=true to require native read-only tool enforcement. Pass tools=false only for an advisor without tools. Unsupported modes never widen access; harnesses_detect shows which modes each harness takes.",
    effect: "exec",
    openWorld: true,
    input: schemas.run,
    async execute(input, { signal }) {
      const { id, prompt, ...options } = input;
      return (await loadOperations()).runHarness(id, prompt, { ...options, signal });
    },
  }),
  harnessTool<McpListParams>({
    name: "harnesses_mcp_list",
    title: "Harnesses MCP List",
    description:
      "List the MCP servers configured in each harness's config files, normalized across dialects. Omit id to scan every harness. Pass name to find one server without reading every listing.",
    effect: "read",
    input: schemas.mcpList,
    async execute(input) {
      const { id, name } = input;
      return (await loadOperations()).mcpList(id, name);
    },
  }),
  harnessTool<McpAddParams>({
    name: "harnesses_mcp_add",
    title: "Harnesses MCP Add",
    description:
      "Add or replace one MCP server in a harness config. JSON configs are rewritten; TOML configs get a surgical, comment-preserving edit.",
    effect: "destructive",
    idempotent: true,
    input: schemas.mcpAdd,
    async execute(input) {
      const { id, scope, ...server } = input;
      return (await loadOperations()).mcpAdd(id, server as McpServerParams, scope);
    },
  }),
  harnessTool<McpSyncParams>({
    name: "harnesses_mcp_sync",
    title: "Harnesses MCP Sync",
    description:
      "Reset every harness's user-scope MCP config to exactly the master list from ~/.config/agntn/mcp.jsonc: servers are added, replaced, and extras removed unless the list's keep names them for that harness. Excluded harnesses keep their own servers. A server's own excludes replaces the global one, and master names a harness is excluded from are withdrawn from it. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.mcpSync,
    async execute(input) {
      const { id, check } = input;
      return (await loadOperations()).mcpSync(id, check === true);
    },
  }),
  harnessTool<AgentsSyncParams>({
    name: "harnesses_agents_sync",
    title: "Harnesses Agents Sync",
    description:
      "Link every harness's global instructions file and declared companions to the master bundle, so edits made through any harness land in one place. Diverged copies are backed up and relinked. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.agentsSync,
    async execute(input) {
      const { id, check } = input;
      return (await loadOperations()).agentsSync(id, check === true);
    },
  }),
  harnessTool<PromptsSyncParams>({
    name: "harnesses_prompts_sync",
    title: "Harnesses Prompts Sync",
    description:
      "Sync canonical Markdown prompt templates from the agntn XDG data directory into every supported harness. Each Markdown target directory becomes one link to the canonical directory; Gemini's directory holds only generated TOML. Anything else there is backed up first. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.promptsSync,
    async execute(input) {
      const { id, check } = input;
      return (await loadOperations()).promptsSync(id, check === true);
    },
  }),
  harnessTool<SkillsSyncParams>({
    name: "harnesses_skills_sync",
    title: "Harnesses Skills Sync",
    description:
      "Link every harness's user-scope skills directory to the canonical skills directory in the agntn XDG data directory, so a skill added or edited through any harness lands in one place. Links to single skills in the source are replaced; anything else there is backed up first. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.skillsSync,
    async execute(input) {
      const { id, check } = input;
      return (await loadOperations()).skillsSync(id, check === true);
    },
  }),
  harnessTool<McpRemoveParams>({
    name: "harnesses_mcp_remove",
    title: "Harnesses MCP Remove",
    description:
      "Remove one MCP server from a harness config. JSON configs are rewritten; TOML configs get a surgical, comment-preserving edit.",
    effect: "destructive",
    idempotent: true,
    input: schemas.mcpRemove,
    async execute(input) {
      const { id, name, scope } = input;
      return (await loadOperations()).mcpRemove(id, name, scope);
    },
  }),
];
