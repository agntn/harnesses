/**
 * Tool executors behind the agent extensions.
 *
 * Each executor returns the text a caller reads plus the structured details a
 * harness can attach to the call. The text is TOON-encoded so the model sees
 * the same compact shape the CLI's --toon flag prints.
 */
import { encode as toToon } from "@toon-format/toon";
import { getAllHarnesses, getHarness, isHarnessId, listHarnesses } from "./registry.ts";
import {
  addMcpServer,
  listMcpServers,
  readMasterMcpServers,
  removeMcpServer,
  syncMcpServers,
} from "./mcp-servers.ts";
import type { McpConfigListing, SyncReport } from "./mcp-servers.ts";
export type { SyncReport } from "./mcp-servers.ts";
import type { Harness } from "./harness.ts";
import type {
  HarnessCapabilities,
  HarnessDetection,
  HarnessId,
  InvokeResult,
  McpServerConfig,
  PathCandidate,
  ResolvedPaths,
  StorageDescriptor,
} from "./types.ts";

/** Text for the model plus details for the harness, shared by every tool surface. */
export interface ToolResult<Details> {
  content: Array<{ type: "text"; text: string }>;
  details: Details;
  /** Set when the tool could not answer. */
  isError?: boolean;
}

/** Install state of one harness on this machine. */
export interface HarnessStatus {
  id: HarnessId;
  name: string;
  installed: boolean;
  version: string | null;
}

/** Every registered harness with its install state, as scanned by {@link detectHarnesses}. */
export interface HarnessListing {
  harnesses: HarnessStatus[];
}

/** Full metadata for one harness, including paths resolved for this platform. */
export interface HarnessMetadata {
  id: HarnessId;
  name: string;
  binaries: string[];
  capabilities: HarnessCapabilities;
  config: PathCandidate[];
  sessions: PathCandidate[];
  instructions: PathCandidate[];
  skills: PathCandidate[];
  commands: PathCandidate[];
  hooks: PathCandidate[];
  persistence: StorageDescriptor[];
  detection: HarnessDetection;
  resolved: ResolvedPaths;
}

/** Returned when the requested harness id is not registered. */
export interface UnknownHarness {
  error: string;
  known: HarnessId[];
}

import { RUN_TIMEOUT_DEFAULT_SECONDS } from "./tool-schemas.ts";

/** Default wall-clock budget for one harness run, in seconds. */
export const RUN_DEFAULT_TIMEOUT_SECONDS = RUN_TIMEOUT_DEFAULT_SECONDS;

/** The run tool's per-stream cap: harness output is unbounded, model context is not. */
export const RUN_MAX_OUTPUT_CHARS = 8000;

function text(data: unknown): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text: toToon(data) }];
}

function unknownHarness(id: string): ToolResult<UnknownHarness> {
  const details: UnknownHarness = { error: `Unknown harness: ${id}`, known: listHarnesses() };
  return { content: text(details), details, isError: true };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(output: string): string {
  if (output.length <= RUN_MAX_OUTPUT_CHARS) return output;
  return `${output.slice(0, RUN_MAX_OUTPUT_CHARS)}\n[truncated ${output.length - RUN_MAX_OUTPUT_CHARS} of ${output.length} characters]`;
}

/** Scans every registered harness for its binaries and version. */
export function detectHarnesses(): ToolResult<HarnessListing> {
  const details: HarnessListing = {
    harnesses: getAllHarnesses().map((harness) => {
      const installed = harness.isInstalled();
      return {
        id: harness.id,
        name: harness.name,
        installed,
        version: installed ? harness.version : null,
      };
    }),
  };

  return { content: text(details), details };
}

/** Full metadata for one harness, with paths resolved for the current platform. */
export function harnessInfo(id: string): ToolResult<HarnessMetadata | UnknownHarness> {
  if (!isHarnessId(id)) return unknownHarness(id);

  const harness = getHarness(id);
  const details: HarnessMetadata = {
    id: harness.id,
    name: harness.name,
    binaries: harness.binaries,
    capabilities: harness.capabilities,
    config: harness.config,
    sessions: harness.sessions,
    instructions: harness.instructions,
    skills: harness.skills,
    commands: harness.commands,
    hooks: harness.hooks,
    persistence: harness.persistence,
    detection: harness.detection,
    resolved: harness.resolve(),
  };

  return { content: text(details), details };
}

/** Options accepted by {@link runHarness}. */
export interface RunOptions {
  cwd?: string;
  /** Wall-clock budget in seconds; defaults to {@link RUN_DEFAULT_TIMEOUT_SECONDS}. */
  timeoutSeconds?: number;
  /** Use the harness's structured (JSON) output mode instead of plain text. */
  structured?: boolean;
}

/** One completed (or failed) harness run, with output capped for the model. */
export interface RunOutcome {
  id: HarnessId;
  command: string;
  args: string[];
  structured: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** Returned when the harness cannot be run at all. */
export interface RunFailure {
  error: string;
  known?: HarnessId[];
}

/**
 * Runs one prompt through a harness's normalized non-interactive invocation.
 *
 * The spawned harness is a full agent with its own tools, so the caller owns
 * the consequences of the prompt; this layer only normalizes the command line,
 * closes stdin, enforces the timeout, and caps the echoed output.
 */
export async function runHarness(
  id: string,
  prompt: string,
  options: RunOptions = {},
): Promise<ToolResult<RunOutcome | RunFailure>> {
  if (!isHarnessId(id)) return unknownHarness(id);

  const harness = getHarness(id);
  const structured = options.structured ?? false;
  if (!harness.buildInvocation(prompt, { structured })) {
    const details: RunFailure = {
      error:
        structured && harness.invocation
          ? `Harness ${id} has no structured (JSON) invocation`
          : `Harness ${id} has no non-interactive invocation`,
    };
    return { content: text(details), details, isError: true };
  }

  const timeoutSeconds = options.timeoutSeconds ?? RUN_DEFAULT_TIMEOUT_SECONDS;

  let result: InvokeResult;
  try {
    result = await harness.invoke(prompt, {
      cwd: options.cwd,
      timeoutMs: timeoutSeconds * 1000,
      structured,
    });
  } catch (error) {
    const details: RunFailure = { error: `Failed to run ${id}: ${errorMessage(error)}` };
    return { content: text(details), details, isError: true };
  }

  const details: RunOutcome = {
    id: harness.id,
    command: result.command,
    args: result.args,
    structured,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
  };

  return {
    content: text(details),
    details,
    ...(result.timedOut || result.exitCode !== 0 ? { isError: true } : {}),
  };
}

/** MCP server listings for one harness or all of them. */
export interface McpListing {
  harnesses: Array<{ id: HarnessId; configs: McpConfigListing[] }>;
}

/** Result of one MCP config mutation. */
export interface McpMutation {
  id: HarnessId;
  path: string;
  action: "added" | "replaced" | "removed" | "noop";
}

/** Flat tool parameters describing one MCP server, shared by every surface. */
export interface McpServerParams {
  name: string;
  transport?: McpServerConfig["transport"];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** Builds the normalized server shape from flat tool parameters. */
export function toMcpServerConfig(params: McpServerParams): McpServerConfig {
  const server: McpServerConfig = {
    name: params.name,
    transport: params.transport ?? (params.url ? "http" : "stdio"),
  };
  if (params.command !== undefined) server.command = params.command;
  if (params.args !== undefined) server.args = params.args;
  if (params.env !== undefined) server.env = params.env;
  if (params.url !== undefined) server.url = params.url;
  if (params.headers !== undefined) server.headers = params.headers;
  return server;
}

/** Lists configured MCP servers, normalized across harness config dialects. */
export function mcpList(id?: string): ToolResult<McpListing | UnknownHarness> {
  if (id !== undefined && !isHarnessId(id)) return unknownHarness(id);

  const targets = id !== undefined && isHarnessId(id) ? [getHarness(id)] : getAllHarnesses();
  const details: McpListing = {
    harnesses: targets
      .map((harness) => ({ id: harness.id, configs: listMcpServers(harness) }))
      .filter((entry) => entry.configs.length > 0),
  };

  return { content: text(details), details };
}

function mcpMutate(
  id: string,
  mutate: (harness: Harness) => { path: string; action: McpMutation["action"] },
): ToolResult<McpMutation | RunFailure> {
  if (!isHarnessId(id)) return unknownHarness(id);

  try {
    const { path, action } = mutate(getHarness(id));
    const details: McpMutation = { id, path, action };
    return { content: text(details), details, ...(action === "noop" ? { isError: true } : {}) };
  } catch (error) {
    const details: RunFailure = { error: errorMessage(error) };
    return { content: text(details), details, isError: true };
  }
}

/** Adds or replaces one MCP server in a harness's config. */
export function mcpAdd(
  id: string,
  params: McpServerParams,
  scope: "user" | "project" = "user",
): ToolResult<McpMutation | RunFailure> {
  return mcpMutate(id, (harness) => {
    const { path, replaced } = addMcpServer(harness, toMcpServerConfig(params), scope);
    return { path, action: replaced ? "replaced" : "added" };
  });
}

/** Removes one MCP server from a harness's config. */
export function mcpRemove(
  id: string,
  name: string,
  scope: "user" | "project" = "user",
): ToolResult<McpMutation | RunFailure> {
  return mcpMutate(id, (harness) => {
    const { path, removed } = removeMcpServer(harness, name, scope);
    return { path, action: removed ? "removed" : "noop" };
  });
}

/** Pushes the master MCP list from ~/.config/agntn/mcp.jsonc into harness configs. */
export function mcpSync(id?: string): ToolResult<SyncReport | RunFailure> {
  if (id !== undefined && !isHarnessId(id)) return unknownHarness(id);

  try {
    // Preflight before any write: a typo in excludes must fail the whole run,
    // not silently leave the misspelled harness unprotected.
    const unknown = readMasterMcpServers().excludes.filter((entry) => !isHarnessId(entry));
    if (unknown.length > 0) {
      const details: RunFailure = {
        error: `Master MCP list excludes unknown harnesses: ${unknown.join(", ")}`,
        known: listHarnesses(),
      };
      return { content: text(details), details, isError: true };
    }
    const details = syncMcpServers(
      id !== undefined && isHarnessId(id) ? [getHarness(id)] : getAllHarnesses(),
    );
    return { content: text(details), details };
  } catch (error) {
    const details: RunFailure = { error: errorMessage(error) };
    return { content: text(details), details, isError: true };
  }
}
