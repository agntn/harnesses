/** The harnesses tools, declared once for every host. Executors load on the first call. */

import { defineTool, type ToolDefinition } from "@agntn/tools";
import { harnessToolSchemas } from "./tool-schemas.ts";

type ToolOperations = typeof import("./tool-operations.ts");

const schemas = harnessToolSchemas();
let operationsPromise: Promise<ToolOperations> | undefined;

/**
 * Loads the executors on the first call, then refuses a call cancelled meanwhile.
 *
 * @param signal - The call's cancellation.
 * @returns {Promise<ToolOperations>} The shared executor module.
 */
async function loadOperations(signal?: AbortSignal): Promise<ToolOperations> {
  operationsPromise ??= import("./tool-operations.ts");
  const operations = await operationsPromise;
  signal?.throwIfAborted();
  return operations;
}

/** The eleven harnesses tools, in `tools/list` order. */
export const harnessesTools = [
  defineTool({
    name: "harnesses_detect",
    title: "Harnesses Detect",
    description:
      "List every known AI coding harness with its install state, version and the harnesses_run modes it takes: advisor (tools=false), readOnly (tools=true with readOnly=true) and agent (tools=true).",
    snippet:
      "Use harnesses_detect to see which AI coding harnesses are installed and how each one runs.",
    guidelines: [
      "The scan checks binaries on PATH. Versions come from native metadata or the CLI.",
    ],
    effect: "read",
    input: schemas.detect,
    execute: async (_input, { signal }) => (await loadOperations(signal)).detectHarnesses(),
  }),
  defineTool({
    name: "harnesses_info",
    title: "Harnesses Info",
    description:
      "Full metadata for one or more AI coding harnesses, including supported invocation and model operations, whether a read-only run keeps its network and which tools, configuration, sessions, instructions, skills, commands, prompt templates, hooks, temp directories, the env variables that move them, and resolved paths.",
    snippet: "Use harnesses_info to look up where coding harnesses store their data.",
    guidelines: [
      "Pass one harness id from harnesses_detect, or batch several ids in one call.",
      "Resolved paths are absolute for the current platform and home directory.",
    ],
    effect: "read",
    input: schemas.info,
    execute: async (input, { signal }) => (await loadOperations(signal)).harnessInfo(input.id),
  }),
  defineTool({
    name: "harnesses_models",
    title: "Harnesses Models",
    description:
      "List the models currently available to one AI coding harness through its native CLI, normalized across providers. An optional search filter is passed to harnesses that support it. The command may load project configuration and extensions.",
    snippet: "Use harnesses_models to inspect models available to an installed coding harness.",
    effect: "exec",
    openWorld: true,
    input: schemas.models,
    async execute(input, { signal }) {
      const { id, ...options } = input;
      return (await loadOperations(signal)).listHarnessModels(id, { ...options, signal });
    },
  }),
  defineTool({
    name: "harnesses_run",
    title: "Harnesses Run",
    description:
      "Run one prompt through an AI coding harness's normalized non-interactive invocation and return its output. Pass tools=true whenever the task needs harness tools, including Grok native X search. Add readOnly=true to require native read-only tool enforcement. Pass tools=false only for an advisor without tools. Unsupported modes never widen access; harnesses_detect shows which modes each harness takes.",
    snippet: "Use harnesses_run to delegate one prompt to another installed coding harness.",
    guidelines: [
      "A run that needs the web checks readOnlyNetwork in harnesses_info first: false means its MCP servers get no network under readOnly.",
      "A run that needs extension or MCP tools checks readOnlyTools in harnesses_info first: a list there is every tool the run keeps under readOnly.",
      "Output is capped for context; long runs stop at the timeout.",
    ],
    effect: "exec",
    openWorld: true,
    input: schemas.run,
    async execute(input, { signal }) {
      const { id, prompt, ...options } = input;
      return (await loadOperations(signal)).runHarness(id, prompt, { ...options, signal });
    },
  }),
  defineTool({
    name: "harnesses_mcp_list",
    title: "Harnesses MCP List",
    description:
      "List the MCP servers configured in each harness's config files, normalized across dialects. Omit id to scan every harness. Pass name to find one server without reading every listing.",
    snippet: "Use harnesses_mcp_list to see which MCP servers each coding harness has configured.",
    effect: "read",
    input: schemas.mcpList,
    cli: {
      command: "mcp-servers list",
      description: "List configured MCP servers, normalized",
      positional: ["id"],
      plain: ["id"],
    },
    async execute(input, { signal }) {
      const { id, name } = input;
      return (await loadOperations(signal)).mcpList(id, name);
    },
  }),
  defineTool({
    name: "harnesses_mcp_add",
    title: "Harnesses MCP Add",
    description:
      "Add or replace one MCP server in a harness config. JSON configs are rewritten; TOML configs get a surgical, comment-preserving edit.",
    effect: "destructive",
    idempotent: true,
    input: schemas.mcpAdd,
    cli: { command: "mcp-servers add" },
    async execute(input, { signal }) {
      const { id, scope, ...server } = input;
      return (await loadOperations(signal)).mcpAdd(id, server, scope);
    },
  }),
  defineTool({
    name: "harnesses_mcp_sync",
    title: "Harnesses MCP Sync",
    description:
      "Reset every harness's user-scope MCP config to exactly the master list from ~/.config/agntn/mcp.jsonc: servers are added, replaced, and extras removed unless the list's keep names them for that harness. Excluded harnesses keep their own servers. A server's own excludes replaces the global one, and master names a harness is excluded from are withdrawn from it. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.mcpSync,
    cli: {
      command: "mcp-servers sync",
      description: "Reset harness configs to the master list from ~/.config/agntn/mcp.jsonc",
      positional: ["id"],
      plain: ["id"],
    },
    async execute(input, { signal }) {
      const { id, check } = input;
      return (await loadOperations(signal)).mcpSync(id, check === true);
    },
  }),
  defineTool({
    name: "harnesses_agents_sync",
    title: "Harnesses Agents Sync",
    description:
      "Link every harness's global instructions file and declared companions to the master bundle, so edits made through any harness land in one place. Diverged copies are backed up and relinked. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.agentsSync,
    cli: {
      command: "agents sync",
      description: "Link global instructions and declared companions (agents.jsonc)",
      positional: ["id"],
      plain: ["id"],
    },
    async execute(input, { signal }) {
      const { id, check } = input;
      return (await loadOperations(signal)).agentsSync(id, check === true);
    },
  }),
  defineTool({
    name: "harnesses_prompts_sync",
    title: "Harnesses Prompts Sync",
    description:
      "Sync canonical Markdown prompt templates from the agntn XDG data directory into every supported harness. Each Markdown target directory becomes one link to the canonical directory; Gemini's directory holds only generated TOML. Anything else there is backed up first. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.promptsSync,
    cli: {
      command: "prompts sync",
      description: "Sync Markdown templates from the agntn XDG data directory into harnesses",
      positional: ["id"],
      plain: ["id"],
    },
    async execute(input, { signal }) {
      const { id, check } = input;
      return (await loadOperations(signal)).promptsSync(id, check === true);
    },
  }),
  defineTool({
    name: "harnesses_skills_sync",
    title: "Harnesses Skills Sync",
    description:
      "Link every harness's user-scope skills directory to the canonical skills directory in the agntn XDG data directory, so a skill added or edited through any harness lands in one place. Links to single skills in the source are replaced; anything else there is backed up first. Pass check to only report.",
    effect: "destructive",
    idempotent: true,
    input: schemas.skillsSync,
    cli: {
      command: "skills sync",
      description: "Link harness skills directories to the agntn XDG data skills folder",
      positional: ["id"],
      plain: ["id"],
    },
    async execute(input, { signal }) {
      const { id, check } = input;
      return (await loadOperations(signal)).skillsSync(id, check === true);
    },
  }),
  defineTool({
    name: "harnesses_mcp_remove",
    title: "Harnesses MCP Remove",
    description:
      "Remove one MCP server from a harness config. JSON configs are rewritten; TOML configs get a surgical, comment-preserving edit.",
    effect: "destructive",
    idempotent: true,
    input: schemas.mcpRemove,
    cli: {
      command: "mcp-servers remove",
      description: "Remove one MCP server from a harness config",
      positional: ["id", "name"],
      plain: ["id", "name"],
    },
    async execute(input, { signal }) {
      const { id, name, scope } = input;
      return (await loadOperations(signal)).mcpRemove(id, name, scope);
    },
  }),
] as const satisfies readonly ToolDefinition[];
