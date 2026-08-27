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

function cutAt(text: string, end: number): string {
  const last = text.charCodeAt(end - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? end - 1 : end);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${cutAt(text, max - 1)}…`;
}

function cleanTerminalText(text: string): string {
  return stripVTControlCharacters(text.toWellFormed())
    .replace(TERMINAL_UNSAFE, " ")
    .replace(/\p{Zs}+/gu, " ")
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

function scalar(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function listLength(record: Record<string, unknown>, key: string): number | undefined {
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

function callDescription(tool: HarnessToolName, args: unknown): string | undefined {
  const record = isRecord(args) ? args : {};
  const id = scalar(record, "id");
  const name = scalar(record, "name");

  switch (tool) {
    case "harnesses_detect":
      return undefined;
    case "harnesses_run": {
      const prompt = scalar(record, "prompt");
      const value = [id, prompt].filter((part) => part !== undefined).join(" ");
      return value.length > 0 ? sanitizeTerminalText(value) : undefined;
    }
    case "harnesses_mcp_add":
    case "harnesses_mcp_remove": {
      const value = [id, name].filter((part) => part !== undefined).join(" ");
      return value.length > 0 ? sanitizeTerminalText(value) : undefined;
    }
    case "harnesses_agents_sync":
      if (record.check === true) return id ? `${sanitizeTerminalText(id)} check` : "check";
      return id ? sanitizeTerminalText(id) : undefined;
    default:
      return id ? sanitizeTerminalText(id) : undefined;
  }
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

function failureDescription(details: Record<string, unknown>): string | undefined {
  const error = scalar(details, "error");
  return error ? sanitizeTerminalText(error) : undefined;
}

function resultMeta(tool: HarnessToolName, details: Record<string, unknown>): string[] {
  switch (tool) {
    case "harnesses_detect": {
      const harnesses = Array.isArray(details.harnesses) ? details.harnesses : [];
      const installed = harnesses.filter(
        (harness) => isRecord(harness) && harness.installed === true,
      ).length;
      return [`${installed}/${harnesses.length} installed`];
    }
    case "harnesses_info": {
      const id = scalar(details, "id");
      const name = scalar(details, "name");
      return [id, name]
        .filter((value) => value !== undefined)
        .map((value) => sanitizeTerminalText(value));
    }
    case "harnesses_models": {
      const id = scalar(details, "id");
      const models = listLength(details, "models");
      return [
        id ? sanitizeTerminalText(id) : undefined,
        models === undefined ? undefined : `${models} models`,
      ].filter((value): value is string => value !== undefined);
    }
    case "harnesses_run": {
      const id = scalar(details, "id");
      const timedOut = details.timedOut === true;
      const exitCode = typeof details.exitCode === "number" ? details.exitCode : null;
      return [
        id ? sanitizeTerminalText(id) : undefined,
        timedOut ? "timed out" : exitCode === null ? undefined : `exit ${exitCode}`,
      ].filter((value): value is string => value !== undefined);
    }
    case "harnesses_mcp_list": {
      const count = listLength(details, "harnesses");
      return count === undefined ? [] : [`${count} harnesses`];
    }
    case "harnesses_mcp_add":
    case "harnesses_mcp_remove": {
      const action = scalar(details, "action");
      return action ? [sanitizeTerminalText(action)] : [];
    }
    case "harnesses_mcp_sync": {
      const servers = listLength(details, "servers");
      const targets = listLength(details, "targets");
      return [
        servers === undefined ? undefined : `${servers} servers`,
        targets === undefined ? undefined : `${targets} harnesses`,
      ].filter((value): value is string => value !== undefined);
    }
    case "harnesses_agents_sync": {
      const targets = Array.isArray(details.targets) ? details.targets : [];
      const changed = targets.filter(
        (target) => !isRecord(target) || target.action !== "skipped",
      ).length;
      return [`${changed} targets`];
    }
  }
}

export function renderToolResult(
  tool: HarnessToolName,
  result: RenderedToolResult,
  isError: boolean,
  options: RenderOptions,
  theme: StatusTheme,
): string {
  const details = isRecord(result.details) ? result.details : {};
  const noop = scalar(details, "action") === "noop";
  const failed =
    isError || result.isError === true || failureDescription(details) !== undefined || noop;
  const icon = paint(theme, failed ? "error" : "success", failed ? "✗" : "✓");
  const parts = [
    icon,
    paint(theme, "accent", `(${noop ? "noop" : failed ? "failed" : HARNESS_TOOL_APPROVALS[tool]})`),
  ];
  const error = failureDescription(details);
  if (error) parts.push(paint(theme, "error", error));
  else if (!noop) {
    const meta = resultMeta(tool, details);
    if (meta.length > 0) parts.push(paint(theme, "muted", meta.join(" · ")));
  }

  const header = parts.join(" ");
  const body = options.expanded === true ? expandedBody(result, theme) : [];
  return body.length > 0 ? [header, ...body].join("\n") : header;
}
