import { describe, expect, it } from "vitest";
import { getHarness, registerHarness } from "../src/index.ts";
import { Harness } from "../src/harness.ts";
import { runHarness, RUN_MAX_OUTPUT_CHARS } from "../src/tool-operations.ts";

/**
 * Overrides the (locally absent) cursor harness with an invocation backed by
 * the node binary, so invoke() is exercised without any external harness.
 */
class FakeCursor extends Harness {
  readonly id = "cursor";
  readonly name = "Fake Cursor";
  readonly binaries = ["node"];
  readonly capabilities = { mcp: false, vision: false, tools: false, streaming: false };
  readonly config: Harness["config"] = [];
  readonly sessions: Harness["sessions"] = [];
  readonly persistence: Harness["persistence"] = [];
  readonly instructions: Harness["instructions"] = [];
  readonly skills: Harness["skills"] = [];
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  readonly detection = { envVars: [], projectMarkers: [] };
  readonly invocation: Harness["invocation"] = {
    args: ["-e", "console.log('echo:' + process.argv[1]); process.exitCode = 0", "{prompt}"],
    jsonArgs: ["-e", "console.log(JSON.stringify({ echo: process.argv[1] }))", "{prompt}"],
    level: "inferred",
  };
}

describe("normalized invocation", () => {
  it("expands the {prompt} placeholder without spawning", () => {
    const claude = getHarness("claude");
    expect(claude.buildInvocation("do the thing")).toEqual({
      command: "claude",
      args: ["-p", "do the thing"],
    });
  });

  it("returns null for a harness without a headless mode", () => {
    expect(getHarness("mastracode").buildInvocation("x")).toBeNull();
    expect(getHarness("freebuff").buildInvocation("x")).toBeNull();
  });

  it("expands the structured template when requested", () => {
    expect(getHarness("claude").buildInvocation("q", { structured: true })).toEqual({
      command: "claude",
      args: ["-p", "--output-format", "json", "q"],
    });
  });

  it("returns null when structured mode is requested but unavailable", () => {
    expect(getHarness("github-copilot").buildInvocation("x", { structured: true })).toBeNull();
  });

  it("runs the structured invocation and yields parseable JSON", async () => {
    const fake = registerHarness(FakeCursor);

    const result = await fake.invoke("ping", { structured: true });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ echo: "ping" });
  });

  it("runs a prompt through the invocation and captures the output", async () => {
    const fake = registerHarness(FakeCursor);

    const result = await fake.invoke("hello world");

    expect(result.stdout.trim()).toBe("echo:hello world");
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

    const result = await getHarness("cursor").invoke("x", { timeoutMs: 100 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  it("rejects invoking a harness without a headless mode", async () => {
    await expect(getHarness("mastracode").invoke("x")).rejects.toThrow(
      "no non-interactive invocation",
    );
  });
});

describe("process tree timeout termination", () => {
  it("escalates to SIGKILL when process ignores SIGTERM", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: [
            "-e",
            "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 10000);",
          ],
          level: "inferred",
        };
      },
    );

    const start = Date.now();
    const result = await getHarness("cursor").invoke("x", {
      timeoutMs: 50,
      killGracePeriodMs: 50,
    });
    const duration = Date.now() - start;

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(duration).toBeLessThan(2000);
  });

  it("terminates spawned descendant processes on timeout", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: [
            "-e",
            "const { spawn } = require('child_process'); const sub = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']); console.log('SUB_PID:' + sub.pid); setInterval(() => {}, 1000);",
          ],
          level: "inferred",
        };
      },
    );

    const result = await getHarness("cursor").invoke("x", {
      timeoutMs: 100,
      killGracePeriodMs: 50,
    });

    expect(result.timedOut).toBe(true);
    const match = result.stdout.match(/SUB_PID:(\d+)/);
    expect(match).not.toBeNull();
    if (match?.[1]) {
      const subPid = parseInt(match[1], 10);
      let alive = false;
      try {
        process.kill(subPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
      expect(alive).toBe(false);
    }
  });
});

describe("AbortSignal cancellation", () => {
  it("resolves immediately with aborted: true when signal is already aborted", async () => {
    const fake = registerHarness(FakeCursor);
    const controller = new AbortController();
    controller.abort();

    const result = await fake.invoke("ping", { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe("");
  });

  it("aborts an in-flight invocation when signal aborts", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "setTimeout(() => {}, 60000)"],
          level: "inferred",
        };
      },
    );

    const controller = new AbortController();
    const promise = getHarness("cursor").invoke("x", { signal: controller.signal });

    setTimeout(() => controller.abort(), 50);
    const result = await promise;

    expect(result.aborted).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(false);
  });

  it("ignores signal aborted after completion", async () => {
    const fake = registerHarness(FakeCursor);
    const controller = new AbortController();

    const result = await fake.invoke("done", { signal: controller.signal });
    controller.abort();

    expect(result.exitCode).toBe(0);
    expect(result.aborted).toBe(false);
    expect(result.stdout.trim()).toBe("echo:done");
  });

  it("flags an aborted runHarness call as an error", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "setTimeout(() => {}, 60000)"],
          level: "inferred",
        };
      },
    );

    const controller = new AbortController();
    const promise = runHarness("cursor", "x", { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    const result = await promise;

    expect(result.isError).toBe(true);
    const outcome = result.details as { aborted?: boolean; exitCode: number | null };
    expect(outcome.aborted).toBe(true);
    expect(outcome.exitCode).toBeNull();
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

  it("flags a structured request on a harness without a JSON mode", async () => {
    const result = await runHarness("github-copilot", "x", { structured: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no structured (JSON) invocation");
  });

  it("returns the outcome of a successful run", async () => {
    registerHarness(FakeCursor);

    const result = await runHarness("cursor", "ping");

    expect(result.isError).toBeUndefined();
    const outcome = result.details as { stdout: string; exitCode: number | null };
    expect(outcome.stdout.trim()).toBe("echo:ping");
    expect(outcome.exitCode).toBe(0);
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

    const result = await runHarness("cursor", "x");

    expect(result.isError).toBe(true);
    const outcome = result.details as { stdout: string; exitCode: number | null };
    expect(outcome.exitCode).toBe(3);
    expect(outcome.stdout.length).toBeLessThan(RUN_MAX_OUTPUT_CHARS + 100);
    expect(outcome.stdout).toContain("[truncated");
  });
});
