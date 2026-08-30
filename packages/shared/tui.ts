import { stripVTControlCharacters } from "node:util";

export const HARNESS_TOOL_LABELS = {
  harnesses_detect: "Harnesses Detect",
  harnesses_info: "Harnesses Info",
  harnesses_models: "Harnesses Models",
  harnesses_run: "Harnesses Run",
  harnesses_mcp_list: "Harnesses MCP List",
  harnesses_mcp_add: "Harnesses MCP Add",
  harnesses_mcp_sync: "Harnesses MCP Sync",
  harnesses_agents_sync: "Harnesses Agents Sync",
  harnesses_mcp_remove: "Harnesses MCP Remove",
} as const;

export type HarnessToolName = keyof typeof HARNESS_TOOL_LABELS;

export const HARNESS_TOOL_APPROVALS: Record<HarnessToolName, "read" | "exec" | "write"> = {
  harnesses_detect: "read",
  harnesses_info: "read",
  harnesses_models: "exec",
  harnesses_run: "exec",
  harnesses_mcp_list: "read",
  harnesses_mcp_add: "write",
  harnesses_mcp_sync: "write",
  harnesses_agents_sync: "write",
  harnesses_mcp_remove: "write",
};

export interface StatusTheme {
  fg?(color: string, text: string): string;
  bold?(text: string): string;
}

export interface RenderOptions {
  expanded?: boolean;
  isPartial?: boolean;
  spinnerFrame?: number;
  executionStarted?: boolean;
}

export interface RenderedToolResult {
  content?: ReadonlyArray<unknown>;
  details?: unknown;
  isError?: boolean;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SUBJECT_WIDTH = 72;
const FIELD_SCAN_LIMIT = 2048;
const RESULT_BODY_LIMIT = 16_000;
const TERMINAL_UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const MALFORMED_SURROGATE = /\p{Cs}/gu;

function cutAt(text: string, end: number): string {
  const last = text.codePointAt(end - 1);
  const splitsSurrogatePair =
    last !== undefined && (last > 0xffff || (last >= 0xd800 && last <= 0xdbff));
  return text.slice(0, splitsSurrogatePair ? end - 1 : end);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${cutAt(text, max - 1)}…`;
}

function cleanTerminalText(text: string): string {
  return stripVTControlCharacters(text.replaceAll(MALFORMED_SURROGATE, "�"))
    .replace(TERMINAL_UNSAFE, " ")
    .replaceAll(/\p{Zs}+/gu, " ")
    .trim();
}

export function sanitizeTerminalText(value: unknown, max = SUBJECT_WIDTH): string {
  const text = String(value);
  const bounded = text.length > FIELD_SCAN_LIMIT ? `${cutAt(text, FIELD_SCAN_LIMIT - 1)}…` : text;
  return clip(cleanTerminalText(bounded), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scalar(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function listLength(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  return Array.isArray(value) ? value.length : undefined;
}

function resultText(result: RenderedToolResult): string {
  const parts: string[] = [];
  for (const part of result.content ?? []) {
    if (isRecord(part) && typeof part.text === "string") parts.push(part.text);
  }
  return parts.join("\n");
}

function expandedBody(result: RenderedToolResult, theme: StatusTheme): string[] {
  const body = resultText(result);
  if (body.length === 0) return [];
  const truncated = body.length > RESULT_BODY_LIMIT;
  const bounded = truncated ? `${cutAt(body, RESULT_BODY_LIMIT - 1)}…` : body;
  return bounded
    .split(/\r?\n/)
    .map((line) => `  ${paint(theme, "toolOutput", cleanTerminalText(line))}`);
}

type CallDescriptionContext = Readonly<{
  record: Readonly<Record<string, unknown>>;
  id?: string;
  idCount?: number;
  name?: string;
}>;

type CallDescriptionRenderer = (context: CallDescriptionContext) => string | undefined;

function sanitizeJoined(parts: readonly (string | undefined)[]): string | undefined {
  const value = parts.filter((part) => part !== undefined).join(" ");
  return value.length > 0 ? sanitizeTerminalText(value) : undefined;
}

function idDescription({ id, idCount }: CallDescriptionContext): string | undefined {
  if (id) return sanitizeTerminalText(id);
  return idCount === undefined ? undefined : `${idCount} harnesses`;
}

function runDescription({ id, record }: CallDescriptionContext): string | undefined {
  return sanitizeJoined([id, scalar(record, "prompt")]);
}

function mutationDescription({ id, name }: CallDescriptionContext): string | undefined {
  return sanitizeJoined([id, name]);
}

function agentsDescription({ id, record }: CallDescriptionContext): string | undefined {
  if (record.check === true) return id ? `${sanitizeTerminalText(id)} check` : "check";
  return id ? sanitizeTerminalText(id) : undefined;
}

const CALL_DESCRIPTIONS: Record<HarnessToolName, CallDescriptionRenderer> = {
  harnesses_detect: () => undefined,
  harnesses_info: idDescription,
  harnesses_models: idDescription,
  harnesses_run: runDescription,
  harnesses_mcp_list: idDescription,
  harnesses_mcp_add: mutationDescription,
  harnesses_mcp_sync: idDescription,
  harnesses_agents_sync: agentsDescription,
  harnesses_mcp_remove: mutationDescription,
};

function callDescription(tool: HarnessToolName, args: unknown): string | undefined {
  const record = isRecord(args) ? args : {};
  return CALL_DESCRIPTIONS[tool]({
    record,
    id: scalar(record, "id"),
    idCount: listLength(record, "id"),
    name: scalar(record, "name"),
  });
}

function paint(theme: StatusTheme, color: string, text: string): string {
  return theme.fg ? theme.fg(color, text) : text;
}

function callIcon(options: RenderOptions | undefined): string {
  if (options?.isPartial === false) return "✓";
  if (options?.spinnerFrame !== undefined) {
    return SPINNER_FRAMES[options.spinnerFrame % SPINNER_FRAMES.length] ?? "⠋";
  }
  return options?.executionStarted === true ? "◌" : "·";
}

export function renderToolCall(
  tool: HarnessToolName,
  args: unknown,
  options: RenderOptions | undefined,
  theme: StatusTheme,
): string {
  const icon = callIcon(options);
  const iconColor = options?.isPartial === false ? "success" : "accent";
  const label = HARNESS_TOOL_LABELS[tool];
  const title = theme.bold ? theme.bold(label) : label;
  const parts = [paint(theme, iconColor, icon), paint(theme, "toolTitle", title)];
  const description = callDescription(tool, args);
  if (description) parts.push(paint(theme, "dim", description));
  return parts.join(" ");
}

function failureDescription(details: Readonly<Record<string, unknown>>): string | undefined {
  const error = scalar(details, "error");
  return error ? sanitizeTerminalText(error) : undefined;
}

type ResultDetails = Readonly<Record<string, unknown>>;
type ResultMetaRenderer = (details: ResultDetails) => string[];

function compactStrings(values: readonly (string | undefined)[]): string[] {
  return values.filter((value): value is string => value !== undefined);
}

function detectMeta(details: ResultDetails): string[] {
  const harnesses = Array.isArray(details.harnesses) ? details.harnesses : [];
  const installed = harnesses.filter(
    (harness) => isRecord(harness) && harness.installed === true,
  ).length;
  return [`${installed}/${harnesses.length} installed`];
}

function infoMeta(details: ResultDetails): string[] {
  return compactStrings([scalar(details, "id"), scalar(details, "name")]).map((value) =>
    sanitizeTerminalText(value),
  );
}

function modelsMeta(details: ResultDetails): string[] {
  const id = scalar(details, "id");
  const models = listLength(details, "models");
  return compactStrings([
    id ? sanitizeTerminalText(id) : undefined,
    models === undefined ? undefined : `${models} models`,
  ]);
}

function runMeta(details: ResultDetails): string[] {
  const meta: string[] = [];
  const id = scalar(details, "id");
  if (id) meta.push(sanitizeTerminalText(id));
  if (details.timedOut === true) {
    meta.push("timed out");
  } else if (typeof details.exitCode === "number") {
    meta.push(`exit ${details.exitCode}`);
  }
  return meta;
}

function mcpListMeta(details: ResultDetails): string[] {
  const count = listLength(details, "harnesses");
  return count === undefined ? [] : [`${count} harnesses`];
}

function mutationMeta(details: ResultDetails): string[] {
  const action = scalar(details, "action");
  return action ? [sanitizeTerminalText(action)] : [];
}

function mcpSyncMeta(details: ResultDetails): string[] {
  const servers = listLength(details, "servers");
  const targets = listLength(details, "targets");
  return compactStrings([
    servers === undefined ? undefined : `${servers} servers`,
    targets === undefined ? undefined : `${targets} harnesses`,
  ]);
}

function agentsSyncMeta(details: ResultDetails): string[] {
  const targets = Array.isArray(details.targets) ? details.targets : [];
  const changed = targets.filter(
    (target) => !isRecord(target) || target.action !== "skipped",
  ).length;
  return [`${changed} targets`];
}

const RESULT_META: Record<HarnessToolName, ResultMetaRenderer> = {
  harnesses_detect: detectMeta,
  harnesses_info: infoMeta,
  harnesses_models: modelsMeta,
  harnesses_run: runMeta,
  harnesses_mcp_list: mcpListMeta,
  harnesses_mcp_add: mutationMeta,
  harnesses_mcp_sync: mcpSyncMeta,
  harnesses_agents_sync: agentsSyncMeta,
  harnesses_mcp_remove: mutationMeta,
};

function resultMeta(tool: HarnessToolName, details: ResultDetails): string[] {
  return RESULT_META[tool](details);
}

type ResultState = Readonly<{
  noop: boolean;
  failed: boolean;
  error?: string;
}>;

function resultState(
  result: RenderedToolResult,
  details: ResultDetails,
  isError: boolean,
): ResultState {
  const noop = scalar(details, "action") === "noop";
  const error = failureDescription(details);
  return {
    noop,
    failed: isError || result.isError === true || error !== undefined || noop,
    ...(error === undefined ? {} : { error }),
  };
}

function statusLabel(tool: HarnessToolName, state: ResultState): string {
  if (state.noop) return "noop";
  if (state.failed) return "failed";
  return HARNESS_TOOL_APPROVALS[tool];
}

function infoBatchSize(tool: HarnessToolName, details: unknown): number | undefined {
  if (tool !== "harnesses_info" || !Array.isArray(details)) return undefined;
  return details.length;
}

function resultSummary(
  tool: HarnessToolName,
  result: RenderedToolResult,
  details: ResultDetails,
  state: ResultState,
  theme: StatusTheme,
): string | undefined {
  if (state.error) return paint(theme, "error", state.error);
  if (state.noop) return undefined;
  const batchSize = infoBatchSize(tool, result.details);
  const meta = batchSize === undefined ? resultMeta(tool, details) : [`${batchSize} harnesses`];
  return meta.length > 0 ? paint(theme, "muted", meta.join(" · ")) : undefined;
}

export function renderToolResult(
  tool: HarnessToolName,
  result: RenderedToolResult,
  isError: boolean,
  options: RenderOptions,
  theme: StatusTheme,
): string {
  const details = isRecord(result.details) ? result.details : {};
  const state = resultState(result, details, isError);
  const icon = paint(theme, state.failed ? "error" : "success", state.failed ? "✗" : "✓");
  const parts = [icon, paint(theme, "accent", `(${statusLabel(tool, state)})`)];
  const summary = resultSummary(tool, result, details, state, theme);
  if (summary) parts.push(summary);

  const header = parts.join(" ");
  const body = options.expanded === true ? expandedBody(result, theme) : [];
  return body.length > 0 ? [header, ...body].join("\n") : header;
}
