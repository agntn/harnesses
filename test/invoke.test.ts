import { describe, expect, it } from "vitest";
import { getHarness, registerHarness } from "../src/index.ts";
import { Harness } from "../src/harness.ts";
import { harnessInfo, runHarness, RUN_MAX_OUTPUT_CHARS } from "../src/tool-operations.ts";

/**
 * Overrides the (locally absent) cursor harness with an invocation backed by
 * the node binary, so invoke() is exercised without any external harness.
 */
class FakeCursor extends Harness {
  readonly id = "cursor";
  readonly name = "Fake Cursor";
  readonly binaries = ["node"];
  readonly capabilities = {
    mcp: false,
    vision: false,
    audio: false,
    video: false,
    tools: false,
    streaming: false,
  };
  readonly config: Harness["config"] = [];
  readonly sessions: Harness["sessions"] = [];
  readonly persistence: Harness["persistence"] = [];
  readonly instructions: Harness["instructions"] = [];
  readonly skills: Harness["skills"] = [];
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  readonly mcpConfigs: Harness["mcpConfigs"] = [];
  readonly detection = { envVars: [], projectMarkers: [] };
  readonly invocation: Harness["invocation"] = {
    args: ["-e", "console.log('echo:' + process.argv[1]); process.exitCode = 0", "{prompt}"],
    jsonArgs: ["-e", "console.log(JSON.stringify({ echo: process.argv[1] }))", "{prompt}"],
    noToolsArgs: [
      "-e",
      "console.log('advisor:' + process.argv[1]); process.exitCode = 0",
      "{prompt}",
    ],
    noToolsJsonArgs: [
      "-e",
      "console.log(JSON.stringify({ advisor: process.argv[1] }))",
      "{prompt}",
    ],
    level: "inferred",
  };
}

describe("normalized invocation", () => {
  it("keeps the Claude advisor prompt outside the variadic tools option", () => {
    const claude = getHarness("claude");
    expect(claude.buildInvocation("answer this")).toEqual({
      command: "claude",
      args: ["-p", "answer this", "--tools", ""],
    });
    expect(claude.buildInvocation("answer this", { structured: true })).toEqual({
      command: "claude",
      args: ["-p", "--output-format", "json", "answer this", "--tools", ""],
    });
    expect(claude.buildInvocation("answer this", { model: "sonnet" })).toEqual({
      command: "claude",
      args: ["-p", "answer this", "--tools", "", "--model", "sonnet"],
    });
  });

  it("uses the full agent invocation only when tools are enabled", () => {
    const claude = getHarness("claude");
    expect(claude.buildInvocation("do the thing", { tools: true })).toEqual({
      command: "claude",
      args: ["-p", "do the thing"],
    });
  });

  it("enforces Codex read-only tool access through the native sandbox", () => {
    const codex = getHarness("codex");

    expect(codex.buildInvocation("review this", { readOnly: true })).toEqual({
      command: "codex",
      args: ["exec", "--sandbox", "read-only", "review this"],
    });
    expect(codex.buildInvocation("review this", { readOnly: true, structured: true })).toEqual({
      command: "codex",
      args: ["exec", "--sandbox", "read-only", "--json", "review this"],
    });
  });

  it("limits Pi read-only runs to its native inspection tools", () => {
    const pi = getHarness("pi");

    expect(pi.buildInvocation("review this", { readOnly: true })).toEqual({
      command: "pi",
      args: ["-p", "--tools", "read,grep,find,ls", "review this"],
    });
    expect(pi.buildInvocation("review this", { readOnly: true, structured: true })).toEqual({
      command: "pi",
      args: ["-p", "--tools", "read,grep,find,ls", "--mode", "json", "review this"],
    });
  });

  it("rejects read-only access when a harness cannot enforce it", () => {
    expect(getHarness("claude").invocationError({ readOnly: true })).toContain(
      "no read-only full agent invocation",
    );
  });

  it("returns null for a harness without a headless mode", () => {
    expect(getHarness("mastracode").buildInvocation("x")).toBeNull();
    expect(getHarness("freebuff").buildInvocation("x")).toBeNull();
  });

  it("expands the structured template when requested", () => {
    expect(getHarness("claude").buildInvocation("q", { structured: true, tools: true })).toEqual({
      command: "claude",
      args: ["-p", "--output-format", "json", "q"],
    });
  });

  it("returns null when structured mode is requested but unavailable", () => {
    expect(
      getHarness("github-copilot").buildInvocation("x", { structured: true, tools: true }),
    ).toBeNull();
  });

  it("runs the structured invocation and yields parseable JSON", async () => {
    const fake = registerHarness(FakeCursor);

    const result = await fake.invoke("ping", { structured: true });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ advisor: "ping" });
  });

  it("runs a prompt through the invocation and captures the output", async () => {
    const fake = registerHarness(FakeCursor);

    const result = await fake.invoke("hello world");

    expect(result.stdout.trim()).toBe("advisor:hello world");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("kills a run that exceeds the timeout", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "setTimeout(() => {}, 60000)"],
          level: "inferred",
        };
      },
    );

    const result = await getHarness("cursor").invoke("x", { timeoutMs: 300, tools: true });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  it("rejects invoking a harness without a headless mode", async () => {
    await expect(getHarness("mastracode").invoke("x")).rejects.toThrow(
      "no non-interactive invocation",
    );
  });
});

describe("harness metadata for agents", () => {
  it("exposes invocation modes through the harness API", () => {
    expect(getHarness("claude").invocationModes).toEqual({
      advisor: true,
      advisorStructured: true,
      readOnly: false,
      readOnlyStructured: false,
      agent: true,
      agentStructured: true,
    });
    expect(getHarness("codex").invocationModes).toEqual({
      advisor: false,
      advisorStructured: false,
      readOnly: true,
      readOnlyStructured: true,
      agent: true,
      agentStructured: true,
    });
    expect(getHarness("mastracode").invocationModes).toEqual({
      advisor: false,
      advisorStructured: false,
      readOnly: false,
      readOnlyStructured: false,
      agent: false,
      agentStructured: false,
    });
  });

  it("reports advisor and agent modes before invocation", () => {
    const claude = harnessInfo("claude").details;
    const codex = harnessInfo("codex").details;

    expect(claude).toMatchObject({
      invocationModes: getHarness("claude").invocationModes,
    });
    expect(codex).toMatchObject({
      invocationModes: getHarness("codex").invocationModes,
    });
  });
});

describe("runHarness tool operation", () => {
  it("flags an unknown harness id", async () => {
    const result = await runHarness("nope", "x");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Unknown harness: nope");
  });

  it("flags a harness without a headless mode", async () => {
    const result = await runHarness("freebuff", "x");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no non-interactive invocation");
  });

  it("returns an actionable full agent retry when Grok advisor mode is unavailable", async () => {
    const result = await runHarness("grok", "search X");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("retry with tools: true to start its full agent");
    expect(result.details).toMatchObject({
      invocationModes: {
        advisor: false,
        advisorStructured: false,
        agent: true,
        agentStructured: true,
      },
      retry: { tools: true },
    });
  });

  it("returns an actionable retry without JSON when JSON mode is unavailable", async () => {
    const result = await runHarness("github-copilot", "x", { structured: true, tools: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no structured (JSON) full agent invocation");
    expect(result.details).toMatchObject({ retry: { structured: false } });
  });

  it("returns every option needed for an executable retry", async () => {
    const result = await runHarness("github-copilot", "x", { structured: true, tools: false });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ retry: { structured: false, tools: true } });
  });

  it("returns the outcome of a successful run", async () => {
    registerHarness(FakeCursor);

    const result = await runHarness("cursor", "ping");

    expect(result.isError).toBeUndefined();
    const outcome = result.details as { stdout: string; exitCode: number | null; tools: boolean };
    expect(outcome.stdout.trim()).toBe("advisor:ping");
    expect(outcome.exitCode).toBe(0);
    expect(outcome.tools).toBe(false);
  });

  it("reports enforced read-only access in the run outcome", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('write')"],
          readOnlyArgs: ["-e", "console.log('read:' + process.argv[1])", "{prompt}"],
          level: "inferred",
        };
      },
    );

    const result = await runHarness("cursor", "review", { tools: false, readOnly: true });

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({
      stdout: "read:review\n",
      tools: true,
      readOnly: true,
    });
  });

  it("keeps unsupported read-only access from widening to a full agent", async () => {
    const result = await runHarness("claude", "inspect", { tools: true, readOnly: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no read-only full agent invocation");
    expect(result.details).not.toHaveProperty("retry");
  });

  it("marks a non-zero exit as an error and truncates long output", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('x'.repeat(20000)); process.exit(3)"],
          level: "inferred",
        };
      },
    );

    const result = await runHarness("cursor", "x", { tools: true });

    expect(result.isError).toBe(true);
    const outcome = result.details as { stdout: string; exitCode: number | null };
    expect(outcome.exitCode).toBe(3);
    expect(outcome.stdout.length).toBeLessThan(RUN_MAX_OUTPUT_CHARS + 100);
    expect(outcome.stdout).toContain("[truncated");
  });
});
