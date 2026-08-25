import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-coding-agent";
import { renderStatusLine } from "@oh-my-pi/pi-coding-agent/tui";

import type * as HarnessTools from "../../../dist/tool-operations.d.mts";

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

export default function harnessesExtension(pi: ExtensionAPI): void {
  // OMP validates tool parameters with its own TypeBox build, so schemas must
  // come from the host-injected facade rather than a standalone typebox import.
  const { Type } = pi.typebox;
  pi.setLabel("Harnesses");

  pi.registerTool({
    name: "harnesses_detect",
    label: "Harnesses Detect",
    description: "List every known AI coding harness with its install state and version",
    parameters: Type.Object({}),
    approval: "read",
    async execute(_toolCallId, _params): Promise<AgentToolResult<HarnessTools.HarnessListing>> {
      const { detectHarnesses } = await loadToolOperations();
      const { content, details } = detectHarnesses();
      return { content, details };
    },
    renderCall(_args, options, theme) {
      const icon = options.isPartial
        ? options.spinnerFrame === undefined
          ? "pending"
          : "running"
        : "done";

      return new Text(
        renderStatusLine(
          { icon, spinnerFrame: options.spinnerFrame, title: "Harnesses Detect" },
          theme,
        ),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const listing = result.details;
      const scanned = listing && "harnesses" in listing ? listing.harnesses : undefined;

      return new Text(
        renderStatusLine(
          {
            icon: result.isError ? "error" : "done",
            title: "Harnesses Detect",
            badge: { label: "read", color: "accent" },
            meta: scanned
              ? [`${scanned.filter((h) => h.installed).length}/${scanned.length} installed`]
              : undefined,
          },
          theme,
        ),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "harnesses_info",
    label: "Harnesses Info",
    description:
      "Full metadata for one AI coding harness: config, session, instruction, skill, command, and hook paths, plus paths resolved for this platform",
    parameters: Type.Object({
      id: Type.String({
        description: "Harness id",
        minLength: 1,
        maxLength: 50,
        pattern: "^[a-z][a-z0-9-]*$",
      }),
    }),
    approval: "read",
    async execute(
      _toolCallId,
      params,
    ): Promise<AgentToolResult<HarnessTools.HarnessMetadata | HarnessTools.UnknownHarness>> {
      const { harnessInfo } = await loadToolOperations();
      const { content, details } = harnessInfo(params.id);
      return { content, details };
    },
    renderCall(args, options, theme) {
      const icon = options.isPartial
        ? options.spinnerFrame === undefined
          ? "pending"
          : "running"
        : "done";

      return new Text(
        renderStatusLine(
          {
            icon,
            spinnerFrame: options.spinnerFrame,
            title: "Harnesses Info",
            description: sanitizeTerminalText(args.id),
          },
          theme,
        ),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const info = result.details;
      const resolved = info && "name" in info ? info : undefined;

      return new Text(
        renderStatusLine(
          {
            icon: result.isError ? "error" : "done",
            title: "Harnesses Info",
            badge: { label: "read", color: "accent" },
            meta: resolved
              ? [sanitizeTerminalText(resolved.id), sanitizeTerminalText(resolved.name)]
              : undefined,
          },
          theme,
        ),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "harnesses_run",
    label: "Harnesses Run",
    description:
      "Run one prompt through an AI coding harness's normalized non-interactive invocation and return its output",
    parameters: Type.Object({
      id: Type.String({
        description: "Harness id",
        minLength: 1,
        maxLength: 50,
        pattern: "^[a-z][a-z0-9-]*$",
      }),
      prompt: Type.String({
        description: "Prompt to send to the harness",
        minLength: 1,
        maxLength: 100000,
      }),
      cwd: Type.Optional(
        Type.String({
          description: "Working directory for the run",
          minLength: 1,
          maxLength: 4096,
        }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          description: "Wall-clock budget in seconds (default 600)",
          minimum: 1,
          maximum: 3600,
        }),
      ),
    }),
    approval: "exec",
    async execute(
      _toolCallId,
      params,
    ): Promise<AgentToolResult<HarnessTools.RunOutcome | HarnessTools.RunFailure>> {
      const { runHarness } = await loadToolOperations();
      const { content, details } = await runHarness(params.id, params.prompt, {
        cwd: params.cwd,
        timeoutSeconds: params.timeoutSeconds,
      });
      return { content, details };
    },
    renderCall(args, options, theme) {
      const icon = options.isPartial
        ? options.spinnerFrame === undefined
          ? "pending"
          : "running"
        : "done";

      return new Text(
        renderStatusLine(
          {
            icon,
            spinnerFrame: options.spinnerFrame,
            title: "Harnesses Run",
            description: `${sanitizeTerminalText(args.id)} ${sanitizeTerminalText(args.prompt)}`,
          },
          theme,
        ),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const outcome = result.details;
      const finished = outcome && "exitCode" in outcome ? outcome : undefined;

      return new Text(
        renderStatusLine(
          {
            icon: result.isError ? "error" : "done",
            title: "Harnesses Run",
            badge: { label: "exec", color: "accent" },
            meta: finished
              ? [
                  sanitizeTerminalText(finished.id),
                  finished.timedOut ? "timed out" : `exit ${finished.exitCode}`,
                ]
              : undefined,
          },
          theme,
        ),
        0,
        0,
      );
    },
  });
}
