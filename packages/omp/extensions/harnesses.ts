import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import type { AgentToolResult, ExtensionAPI, Theme } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-coding-agent";
import { renderStatusLine, type StatusLineOptions } from "@oh-my-pi/pi-coding-agent/tui";
import type { TSchema } from "@oh-my-pi/pi-ai";
import type { AnySchema } from "@oh-my-pi/omptype/typebox";

import type * as HarnessTools from "../../../dist/tool-operations.d.mts";
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
 */
function loadToolOperations(): Promise<typeof HarnessTools> {
  toolOperationsPromise ??= (
    existsSync(sourceModulePath)
      ? import("../../../src/tool-operations.ts")
      : import("../../../dist/tool-operations.mjs")
  ) as Promise<typeof HarnessTools>;

  return toolOperationsPromise;
}

// Renderer interpolations cross the terminal trust boundary: model arguments and
// external values may carry ANSI/OSC escape sequences or raw C0/C1 control bytes
// that OMP's Text component passes through to the terminal unchanged. String()
// first, because hostile JSON is not bound by the declared parameter types.
export function sanitizeTerminalText(value: unknown): string {
  return stripVTControlCharacters(String(value))
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

type RenderOptions = { isPartial?: boolean; spinnerFrame?: number };
type RenderResult = { isError?: boolean; details?: unknown };

/** Reads one property off an unknown-typed tool argument object. */
function prop(args: unknown, key: string): unknown {
  return typeof args === "object" && args !== null
    ? (args as Record<string, unknown>)[key]
    : undefined;
}

/** Builds the renderCall/renderResult pair every tool uses, varying only text. */
function statusRenderers(
  title: string,
  badge: string,
  describeCall?: (args: unknown) => string | undefined,
  describeResult?: (details: unknown) => string[] | undefined,
) {
  return {
    renderCall(args: unknown, options: RenderOptions, theme: Theme) {
      const line: StatusLineOptions = {
        icon: options.isPartial
          ? options.spinnerFrame === undefined
            ? "pending"
            : "running"
          : "done",
        title,
      };
      if (options.spinnerFrame !== undefined) line.spinnerFrame = options.spinnerFrame;
      const description = describeCall?.(args);
      if (description !== undefined) line.description = description;

      return new Text(renderStatusLine(line, theme), 0, 0);
    },
    renderResult(result: RenderResult, _options: RenderOptions, theme: Theme) {
      const line: StatusLineOptions = {
        icon: result.isError ? "error" : "done",
        title,
        badge: { label: badge, color: "accent" },
      };
      const meta = describeResult?.(result.details);
      if (meta !== undefined) line.meta = meta;

      return new Text(renderStatusLine(line, theme), 0, 0);
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
    label: "Harnesses Detect",
    description: "List every known AI coding harness with its install state and version",
    parameters: schemas.detect,
    approval: "read",
    async execute(_toolCallId, _params): Promise<AgentToolResult<HarnessTools.HarnessListing>> {
      const { detectHarnesses } = await loadToolOperations();
      const { content, details } = detectHarnesses();
      return { content, details };
    },
    ...statusRenderers("Harnesses Detect", "read", undefined, (details) => {
      const listing = details as HarnessTools.HarnessListing | undefined;
      const scanned = listing && "harnesses" in listing ? listing.harnesses : undefined;
      return scanned
        ? [`${scanned.filter((h) => h.installed).length}/${scanned.length} installed`]
        : undefined;
    }),
  });

  pi.registerTool({
    name: "harnesses_info",
    label: "Harnesses Info",
    description:
      "Full metadata for one AI coding harness, including supported advisor and agent invocation modes, configuration, sessions, instructions, skills, commands, hooks, and resolved paths",
    parameters: schemas.info,
    approval: "read",
    async execute(
      _toolCallId,
      params: HarnessSchemas.InfoParams,
    ): Promise<AgentToolResult<HarnessTools.HarnessMetadata | HarnessTools.UnknownHarness>> {
      const { harnessInfo } = await loadToolOperations();
      const { content, details } = harnessInfo(params.id);
      return { content, details };
    },
    ...statusRenderers(
      "Harnesses Info",
      "read",
      (args) => sanitizeTerminalText(prop(args, "id")),
      (details) => {
        const info = details as
          | HarnessTools.HarnessMetadata
          | HarnessTools.UnknownHarness
          | undefined;
        return info && "name" in info
          ? [sanitizeTerminalText(info.id), sanitizeTerminalText(info.name)]
          : undefined;
      },
    ),
  });

  pi.registerTool({
    name: "harnesses_run",
    label: "Harnesses Run",
    description:
      "Run one prompt through an AI coding harness's normalized non-interactive invocation and return its output",
    parameters: schemas.run,
    approval: "exec",
    async execute(
      _toolCallId,
      params: HarnessSchemas.RunParams,
    ): Promise<AgentToolResult<HarnessTools.RunOutcome | HarnessTools.RunFailure>> {
      const { runHarness } = await loadToolOperations();
      const { content, details, isError } = await runHarness(params.id, params.prompt, {
        cwd: params.cwd,
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
    ...statusRenderers(
      "Harnesses Run",
      "exec",
      (args) =>
        `${sanitizeTerminalText(prop(args, "id"))} ${sanitizeTerminalText(prop(args, "prompt"))}`,
      (details) => {
        const outcome = details as HarnessTools.RunOutcome | HarnessTools.RunFailure | undefined;
        return outcome && "exitCode" in outcome
          ? [
              sanitizeTerminalText(outcome.id),
              outcome.timedOut ? "timed out" : `exit ${outcome.exitCode}`,
            ]
          : undefined;
      },
    ),
  });

  pi.registerTool({
    name: "harnesses_mcp_list",
    label: "Harnesses MCP List",
    description:
      "List the MCP servers configured in each harness's config files, normalized across dialects",
    parameters: schemas.mcpList,
    approval: "read",
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpListParams,
    ): Promise<AgentToolResult<HarnessTools.McpListing | HarnessTools.UnknownHarness>> {
      const { mcpList } = await loadToolOperations();
      const { content, details } = mcpList(params.id);
      return { content, details };
    },
    ...statusRenderers(
      "Harnesses MCP List",
      "read",
      (args) =>
        prop(args, "id") === undefined ? undefined : sanitizeTerminalText(prop(args, "id")),
      (details) => {
        const listing = details as
          | HarnessTools.McpListing
          | HarnessTools.UnknownHarness
          | undefined;
        return listing && "harnesses" in listing
          ? [`${listing.harnesses.length} harnesses`]
          : undefined;
      },
    ),
  });

  pi.registerTool({
    name: "harnesses_mcp_add",
    label: "Harnesses MCP Add",
    description:
      "Add or replace one MCP server in a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpAdd,
    approval: "write",
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpAddParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpAdd } = await loadToolOperations();
      const { content, details } = mcpAdd(params.id, params, params.scope ?? "user");
      return { content, details };
    },
    ...statusRenderers(
      "Harnesses MCP Add",
      "write",
      (args) =>
        `${sanitizeTerminalText(prop(args, "id"))} ${sanitizeTerminalText(prop(args, "name"))}`,
      (details) => {
        const mutation = details as HarnessTools.McpMutation | HarnessTools.RunFailure | undefined;
        return mutation && "action" in mutation
          ? [sanitizeTerminalText(mutation.action)]
          : undefined;
      },
    ),
  });

  pi.registerTool({
    name: "harnesses_mcp_sync",
    label: "Harnesses MCP Sync",
    description:
      "Reset every harness's user-scope MCP config to exactly the master list from ~/.config/agntn/mcp.jsonc; extras are removed and master-listed names are withdrawn from excluded harnesses",
    parameters: schemas.mcpSync,
    approval: "write",
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpSyncParams,
    ): Promise<AgentToolResult<HarnessTools.SyncReport | HarnessTools.RunFailure>> {
      const { mcpSync } = await loadToolOperations();
      const { content, details } = mcpSync(params.id);
      return { content, details };
    },
    ...statusRenderers(
      "Harnesses MCP Sync",
      "write",
      (args) =>
        prop(args, "id") === undefined ? undefined : sanitizeTerminalText(prop(args, "id")),
      (details) => {
        const outcome = details as HarnessTools.SyncReport | HarnessTools.RunFailure | undefined;
        return outcome && "targets" in outcome
          ? [`${outcome.servers.length} servers`, `${outcome.targets.length} harnesses`]
          : undefined;
      },
    ),
  });

  pi.registerTool({
    name: "harnesses_agents_sync",
    label: "Harnesses Agents Sync",
    description:
      "Link every harness's global instructions file to the master agents file; diverged copies are backed up and relinked. Pass check to only report",
    parameters: schemas.agentsSync,
    approval: "write",
    async execute(
      _toolCallId,
      params: HarnessSchemas.AgentsSyncParams,
    ): Promise<AgentToolResult<HarnessTools.AgentsSyncReport | HarnessTools.RunFailure>> {
      const { agentsSync } = await loadToolOperations();
      const { content, details } = agentsSync(params.id, params.check === true);
      return { content, details };
    },
    ...statusRenderers(
      "Harnesses Agents Sync",
      "write",
      (args) => (prop(args, "check") === true ? "check" : undefined),
      (details) => {
        const outcome = details as
          | HarnessTools.AgentsSyncReport
          | HarnessTools.RunFailure
          | undefined;
        return outcome && "targets" in outcome
          ? [`${outcome.targets.filter((t) => t.action !== "skipped").length} targets`]
          : undefined;
      },
    ),
  });

  pi.registerTool({
    name: "harnesses_mcp_remove",
    label: "Harnesses MCP Remove",
    description:
      "Remove one MCP server from a harness config; TOML configs get a surgical, comment-preserving edit",
    parameters: schemas.mcpRemove,
    approval: "write",
    async execute(
      _toolCallId,
      params: HarnessSchemas.McpRemoveParams,
    ): Promise<AgentToolResult<HarnessTools.McpMutation | HarnessTools.RunFailure>> {
      const { mcpRemove } = await loadToolOperations();
      const { content, details } = mcpRemove(params.id, params.name, params.scope ?? "user");
      return { content, details };
    },
    ...statusRenderers(
      "Harnesses MCP Remove",
      "write",
      (args) =>
        `${sanitizeTerminalText(prop(args, "id"))} ${sanitizeTerminalText(prop(args, "name"))}`,
      (details) => {
        const mutation = details as HarnessTools.McpMutation | HarnessTools.RunFailure | undefined;
        return mutation && "action" in mutation
          ? [sanitizeTerminalText(mutation.action)]
          : undefined;
      },
    ),
  });
}
