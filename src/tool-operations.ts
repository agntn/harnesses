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
import { readAgentsConfig, syncAgentsFiles } from "./agents-sync.ts";
import type { AgentsSyncReport } from "./agents-sync.ts";
export type { AgentsSyncReport } from "./agents-sync.ts";
export type { SyncReport } from "./mcp-servers.ts";
export type { HarnessInvocationModes } from "./types.ts";
import type { Harness } from "./harness.ts";
import type {
  AvailableModel,
  HarnessCapabilities,
  HarnessDetection,
  HarnessId,
  HarnessInvocationModes,
  InvokeResult,
  ListModelsResult,
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
  invocationModes: HarnessInvocationModes;
  modelListing: boolean;
  modelSelection: boolean;
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

/** Returned when a direct batch call bypasses the tool schema limits. */
export interface HarnessInfoInputError {
  error: string;
}

/** One harness lookup result. */
export type HarnessInfoResult = HarnessMetadata | UnknownHarness;

/** Scalar, batch, or rejected batch details from {@link harnessInfo}. */
export type HarnessInfoDetails = HarnessInfoResult | HarnessInfoResult[] | HarnessInfoInputError;

import { HARNESS_INFO_MAX_ITEMS, RUN_TIMEOUT_DEFAULT_SECONDS } from "./tool-schemas.ts";
export { HARNESS_INFO_MAX_ITEMS } from "./tool-schemas.ts";

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

function modelListingUnavailable(harness: Harness, id: string): RunFailure {
  return {
    error: harness.modelListing
      ? `Harness ${id} does not support filtering its model listing`
      : `Harness ${id} does not support model listing`,
  };
}

type RunInvocationOptions = Readonly<{
  model?: string;
  structured: boolean;
  tools: boolean;
  readOnly: boolean;
}>;

type InvocationMode = keyof HarnessInvocationModes;

const ALTERNATE_INVOCATION_MODE: Partial<Record<InvocationMode, InvocationMode>> = {
  advisor: "agent",
  advisorStructured: "agentStructured",
  agent: "advisor",
  agentStructured: "advisorStructured",
};

function selectedInvocationMode(
  structured: boolean,
  tools: boolean,
  readOnly: boolean,
): InvocationMode {
  if (readOnly) return structured ? "readOnlyStructured" : "readOnly";
  if (tools) return structured ? "agentStructured" : "agent";
  return structured ? "advisorStructured" : "advisor";
}

function invocationRetry(
  invocationModes: Readonly<HarnessInvocationModes>,
  mode: InvocationMode,
  options: RunInvocationOptions,
): RunFailure["retry"] {
  const withoutStructured = selectedInvocationMode(false, options.tools, options.readOnly);
  if (options.structured) {
    if (invocationModes[withoutStructured]) return { structured: false };
    const alternateWithoutStructured = ALTERNATE_INVOCATION_MODE[withoutStructured];
    if (alternateWithoutStructured && invocationModes[alternateWithoutStructured]) {
      return { structured: false, tools: !options.tools };
    }
  }

  const alternateMode = ALTERNATE_INVOCATION_MODE[mode];
  return alternateMode !== undefined && invocationModes[alternateMode]
    ? { tools: !options.tools }
    : undefined;
}

function completedRun(
  harness: Harness,
  result: InvokeResult,
  options: RunInvocationOptions,
): ToolResult<RunOutcome> {
  const contentOutcome: Omit<RunOutcome, "stderr"> = {
    id: harness.id,
    command: result.command,
    args: result.args,
    ...(options.model === undefined ? {} : { model: options.model }),
    structured: options.structured,
    tools: options.tools,
    readOnly: options.readOnly,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: truncate(result.stdout),
  };
  const details: RunOutcome = { ...contentOutcome, stderr: truncate(result.stderr) };
  if (result.timedOut || result.exitCode !== 0) {
    return { content: text(details), details, isError: true };
  }
  return { content: text(result.stdout.length > 0 ? contentOutcome : details), details };
}

function unsupportedInvocation(
  harness: Harness,
  id: string,
  options: RunInvocationOptions,
): ToolResult<RunFailure> {
  const error = harness.invocationError(options) ?? `Invalid ${id} invocation`;
  const invocationModes = harness.invocationModes;
  const mode = selectedInvocationMode(options.structured, options.tools, options.readOnly);
  const modelUnsupported =
    options.model !== undefined && harness.invocation?.modelArgs === undefined;
  if (invocationModes[mode] || harness.invocation === null || modelUnsupported) {
    const details: RunFailure = { error };
    return { content: text(details), details, isError: true };
  }

  const retry = invocationRetry(invocationModes, mode, options);
  const details: RunFailure = {
    error,
    invocationModes,
    ...(retry === undefined ? {} : { retry }),
  };
  return { content: text(details), details, isError: true };
}

/**
 * Scans every registered harness for its binaries and version.
 *
 * @returns {ToolResult<HarnessListing>} The complete installation listing.
 */
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

function harnessInfoResult(id: string): HarnessInfoResult {
  if (!isHarnessId(id)) return unknownHarness(id).details;

  const harness = getHarness(id);
  return {
    id: harness.id,
    name: harness.name,
    binaries: harness.binaries,
    capabilities: harness.capabilities,
    invocationModes: harness.invocationModes,
    modelListing: harness.modelListing !== null,
    modelSelection: harness.invocation?.modelArgs !== undefined,
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
}

/** Full metadata for one harness, with paths resolved for the current platform. */
export function harnessInfo(id: string): ToolResult<HarnessInfoResult>;
/** Full metadata for several harnesses, preserving input order and errors for each item. */
export function harnessInfo(
  ids: readonly string[],
): ToolResult<HarnessInfoResult[] | HarnessInfoInputError>;
export function harnessInfo(input: string | readonly string[]): ToolResult<HarnessInfoDetails>;
export function harnessInfo(input: string | readonly string[]): ToolResult<HarnessInfoDetails> {
  if (typeof input === "string") {
    const details = harnessInfoResult(input);
    return { content: text(details), details, ...("error" in details ? { isError: true } : {}) };
  }

  if (input.length < 1 || input.length > HARNESS_INFO_MAX_ITEMS) {
    const details: HarnessInfoInputError = {
      error: `harnesses_info accepts between 1 and ${HARNESS_INFO_MAX_ITEMS} ids`,
    };
    return { content: text(details), details, isError: true };
  }

  const details = input.map(harnessInfoResult);
  return {
    content: text(details),
    details,
    ...(details.some((result) => "error" in result) ? { isError: true } : {}),
  };
}

/** Options accepted by {@link listHarnessModels}. */
export interface ModelsOptions {
  search?: string;
  cwd?: string;
  /** Wall-clock budget in seconds; defaults to {@link RUN_DEFAULT_TIMEOUT_SECONDS}. */
  timeoutSeconds?: number;
}

/** One completed native model-listing query. */
export interface ModelsOutcome {
  id: HarnessId;
  command: string;
  args: string[];
  search?: string;
  models: AvailableModel[];
  exitCode: number | null;
  timedOut: boolean;
  stderr: string;
}

/**
 * Lists the models currently available to one harness through its native CLI.
 *
 * @param id - Harness id to query.
 * @param options - Search, working-directory, and timeout options.
 * @returns {Promise<ToolResult<ModelsOutcome | RunFailure>>} The model listing or failure.
 */
export async function listHarnessModels(
  id: string,
  options: ModelsOptions = {},
): Promise<ToolResult<ModelsOutcome | RunFailure>> {
  if (!isHarnessId(id)) return unknownHarness(id);

  const harness = getHarness(id);
  const built = harness.buildModelListInvocation(options.search);
  if (!built) {
    const details = modelListingUnavailable(harness, id);
    return { content: text(details), details, isError: true };
  }

  const timeoutSeconds = options.timeoutSeconds ?? RUN_DEFAULT_TIMEOUT_SECONDS;
  let result: ListModelsResult;
  try {
    result = await harness.listModels({
      search: options.search,
      cwd: options.cwd,
      timeoutMs: timeoutSeconds * 1000,
    });
  } catch (error) {
    const details: RunFailure = { error: `Failed to list ${id} models: ${errorMessage(error)}` };
    return { content: text(details), details, isError: true };
  }

  const details: ModelsOutcome = {
    id: harness.id,
    command: result.command,
    args: result.args,
    ...(options.search === undefined ? {} : { search: options.search }),
    models: result.models,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stderr: truncate(result.stderr),
  };

  return {
    content: text(details),
    details,
    ...(result.timedOut || result.exitCode !== 0 ? { isError: true } : {}),
  };
}

/** Options accepted by {@link runHarness}. */
export interface RunOptions {
  cwd?: string;
  /** Harness-native model id or selector. */
  model?: string;
  /** Wall-clock budget in seconds; defaults to {@link RUN_DEFAULT_TIMEOUT_SECONDS}. */
  timeoutSeconds?: number;
  /** Use the harness's structured (JSON) output mode instead of plain text. */
  structured?: boolean;
  /** Enable tools; defaults to a native advisor without tools invocation. */
  tools?: boolean;
  /** Require native enforcement of read-only tool access. Implies tools. */
  readOnly?: boolean;
}

/** One completed (or failed) harness run, with output capped for the model. */
export interface RunOutcome {
  id: HarnessId;
  command: string;
  args: string[];
  model?: string;
  structured: boolean;
  tools: boolean;
  readOnly: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** Returned when the harness cannot be run at all. */
export interface RunFailure {
  error: string;
  known?: HarnessId[];
  /** Modes accepted by the selected harness when invocation mode caused the failure. */
  invocationModes?: HarnessInvocationModes;
  /** Explicit mode change that makes the same invocation shape executable. */
  retry?: { structured: false; tools?: boolean } | { tools: boolean };
}

function normalizedRunAccess(options: Readonly<RunOptions>): {
  tools: boolean;
  readOnly: boolean;
} {
  const readOnly = options.readOnly ?? false;
  return { readOnly, tools: readOnly ? true : (options.tools ?? false) };
}

/**
 * Runs one prompt through a harness's normalized non-interactive invocation.
 *
 * Tool use defaults to a native advisor without tools invocation. Harnesses that
 * cannot disable tools reject that mode; setting `tools` selects their full
 * agent invocation. `model` is translated through the harness-specific recipe.
 * This layer also closes stdin, enforces the timeout, and
 * caps the echoed output.
 *
 * @param id - Harness id to run.
 * @param prompt - Prompt sent to the selected harness.
 * @param options - Model, mode, working-directory, and timeout options.
 * @returns {Promise<ToolResult<RunOutcome | RunFailure>>} The capped run outcome or failure.
 */
export async function runHarness(
  id: string,
  prompt: string,
  options: RunOptions = {},
): Promise<ToolResult<RunOutcome | RunFailure>> {
  if (!isHarnessId(id)) return unknownHarness(id);

  const harness = getHarness(id);
  const structured = options.structured ?? false;
  const { tools, readOnly } = normalizedRunAccess(options);
  const invocationOptions = { model: options.model, structured, tools, readOnly };
  if (!harness.buildInvocation(prompt, invocationOptions)) {
    return unsupportedInvocation(harness, id, invocationOptions);
  }

  const timeoutSeconds = options.timeoutSeconds ?? RUN_DEFAULT_TIMEOUT_SECONDS;

  let result: InvokeResult;
  try {
    result = await harness.invoke(prompt, {
      cwd: options.cwd,
      model: options.model,
      timeoutMs: timeoutSeconds * 1000,
      structured,
      tools,
      readOnly,
    });
  } catch (error) {
    const details: RunFailure = { error: `Failed to run ${id}: ${errorMessage(error)}` };
    return { content: text(details), details, isError: true };
  }

  return completedRun(harness, result, invocationOptions);
}

/** MCP server listings for one harness or all of them. */
export interface McpListing {
  harnesses: Array<{ id: HarnessId; configs: McpConfigListing[] }>;
}

/** Marker used only at the tool and CLI boundary, leaving config reads lossless for edits. */
const MCP_REDACTED_VALUE = "<redacted>";
const MCP_CONFIG_ERROR = "Unable to read or parse MCP config";

function redactMcpValues(values: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.keys(values).map((key) => [key, MCP_REDACTED_VALUE]));
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

/**
 * Builds the normalized server shape from flat tool parameters.
 *
 * @param params - Flat MCP server parameters.
 * @returns {McpServerConfig} The normalized server configuration.
 */
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

/**
 * Lists configured MCP servers, normalized across harness config dialects.
 *
 * @param id - Optional harness id; omission lists every harness.
 * @returns {ToolResult<McpListing | UnknownHarness>} The normalized listing or id error.
 */
export function mcpList(id?: string): ToolResult<McpListing | UnknownHarness> {
  if (id !== undefined && !isHarnessId(id)) return unknownHarness(id);

  const targets = id !== undefined && isHarnessId(id) ? [getHarness(id)] : getAllHarnesses();
  const details: McpListing = {
    harnesses: targets
      .map((harness) => ({
        id: harness.id,
        configs: listMcpServers(harness).map((listing) => ({
          ...listing,
          ...(listing.error === undefined ? {} : { error: MCP_CONFIG_ERROR }),
          servers: listing.servers.map((server) => ({
            ...server,
            ...(server.env === undefined ? {} : { env: redactMcpValues(server.env) }),
            ...(server.headers === undefined ? {} : { headers: redactMcpValues(server.headers) }),
          })),
        })),
      }))
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

/**
 * Adds or replaces one MCP server in a harness's config.
 *
 * @param id - Target harness id.
 * @param params - Server parameters to normalize and write.
 * @param scope - User or project config scope.
 * @returns {ToolResult<McpMutation | RunFailure>} The mutation outcome or failure.
 */
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

/**
 * Removes one MCP server from a harness's config.
 *
 * @param id - Target harness id.
 * @param name - Server name to remove.
 * @param scope - User or project config scope.
 * @returns {ToolResult<McpMutation | RunFailure>} The mutation outcome or failure.
 */
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

/**
 * Pushes the master MCP list from ~/.config/agntn/mcp.jsonc into harness configs.
 *
 * @param id - Optional harness id; omission targets every harness.
 * @returns {ToolResult<SyncReport | RunFailure>} The sync report or failure.
 */
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

/**
 * Links every harness's global instructions file to the master AGENTS.md.
 *
 * @param id - Optional harness id; omission targets every harness.
 * @param check - Report intended changes without writing them.
 * @returns {ToolResult<AgentsSyncReport | RunFailure>} The sync report or failure.
 */
export function agentsSync(id?: string, check = false): ToolResult<AgentsSyncReport | RunFailure> {
  if (id !== undefined && !isHarnessId(id)) return unknownHarness(id);

  try {
    // Preflight before any write: a typo in excludes must fail the whole run,
    // not silently adopt the harness it was meant to protect.
    const unknown = readAgentsConfig().excludes.filter((entry) => !isHarnessId(entry));
    if (unknown.length > 0) {
      const details: RunFailure = {
        error: `Agents config excludes unknown harnesses: ${unknown.join(", ")}`,
        known: listHarnesses(),
      };
      return { content: text(details), details, isError: true };
    }
    const details = syncAgentsFiles(
      id !== undefined && isHarnessId(id) ? [getHarness(id)] : getAllHarnesses(),
      check,
    );
    return { content: text(details), details };
  } catch (error) {
    const details: RunFailure = { error: errorMessage(error) };
    return { content: text(details), details, isError: true };
  }
}
