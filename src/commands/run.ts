import { defineTool, Type } from "@agntn/tools";
import type { InvokeResult } from "../types.ts";
import { harnessId, resolveHarness } from "./harness-id.ts";
import { printed, refusal } from "./output.ts";

/**
 * Passes the harness's streams through and leaves its exit code, 124 after a timeout.
 *
 * @param result - The finished run.
 * @param timeout - The budget it had, in seconds.
 */
async function finish(result: InvokeResult, timeout: number | undefined): Promise<void> {
  const { EXTENSION_RETRY_HINT, TOOL_CALL_TEXT_WARNING } = await import("../tool-operations.ts");
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.toolCallsAsText) process.stderr.write(`${TOOL_CALL_TEXT_WARNING}\n`);
  if (result.extensionLoadFailed) process.stderr.write(`${EXTENSION_RETRY_HINT}\n`);
  if (!result.timedOut) {
    process.exitCode = result.exitCode ?? 1;
    return;
  }
  const idle =
    result.idleMs === undefined ? "" : `; last output ${Math.round(result.idleMs / 1000)}s before`;
  process.stderr.write(`Timed out after ${timeout}s${idle}\n`);
  process.exitCode = 124;
}

export default defineTool({
  name: "harnesses_run",
  title: "Run Harness",
  description: "Run one prompt through a harness's non-interactive mode",
  effect: "exec",
  openWorld: true,
  input: Type.Object(
    {
      id: harnessId,
      prompt: Type.String({ description: "Prompt to send to the harness", minLength: 1 }),
      cwd: Type.Optional(
        Type.String({ description: "Working directory for the run", minLength: 1 }),
      ),
      model: Type.Optional(
        Type.String({ description: "Harness-native model id or selector", minLength: 1 }),
      ),
      effort: Type.Optional(
        Type.String({
          description: "Reasoning effort in the harness's own words (low, high, max)",
          minLength: 1,
        }),
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Wall-clock budget in seconds", exclusiveMinimum: 0 }),
      ),
      structured: Type.Optional(
        Type.Boolean({ description: "Use the harness's structured (JSON) output mode" }),
      ),
      tools: Type.Optional(
        Type.Boolean({
          description: "Enable tools; default false uses native advisor without tools mode",
        }),
      ),
      readOnly: Type.Optional(
        Type.Boolean({
          description: "Require native read-only tool enforcement; implies --tools",
        }),
      ),
      extensions: Type.Optional(
        Type.Boolean({
          description: "Load Pi or OMP extensions; --no-extensions skips a broken one",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description: "Session id to continue, as the harness printed it",
          minLength: 1,
        }),
      ),
      sessionId: Type.Optional(
        Type.String({ description: "UUID for a new session you can resume later", minLength: 1 }),
      ),
    },
    { additionalProperties: false },
  ),
  cli: { positional: ["id", "prompt"], plain: ["id"], json: false },
  async execute(input, { signal }) {
    const { harness, refusal: unknown } = await resolveHarness(input.id);
    if (unknown) return unknown;
    const readOnly = input.readOnly === true;
    const options = {
      model: input.model,
      effort: input.effort,
      extensions: input.extensions !== false,
      structured: input.structured === true,
      tools: input.tools ?? readOnly,
      readOnly,
      resume: input.resume,
      sessionId: input.sessionId,
    };
    if (!harness.buildInvocation("", options)) {
      return refusal(harness.invocationError(options) ?? "Invalid invocation");
    }
    try {
      const result = await harness.invoke(input.prompt, {
        ...options,
        cwd: input.cwd,
        timeoutMs: input.timeout === undefined ? undefined : input.timeout * 1000,
        signal,
      });
      await finish(result, input.timeout);
    } catch (error) {
      return refusal(error instanceof Error ? error.message : String(error));
    }
    return printed(undefined);
  },
});
