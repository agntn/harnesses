import { describe, expect, it } from "vitest";
import { decode as fromToon } from "@toon-format/toon";
import { getEventListeners } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHarness, registerHarness } from "../src/index.ts";
import { Harness } from "../src/harness.ts";
import Claude, { foldClaudeStream } from "../src/harnesses/claude.ts";
import Cursor from "../src/harnesses/cursor.ts";
import {
  harnessInfo,
  listHarnessModels,
  runHarness,
  RUN_MAX_OUTPUT_CHARS,
} from "../src/tool-operations.ts";

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
  override readonly mcpConfigs: Harness["mcpConfigs"] = [];
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
  it("preserves replacement tokens in prompts across invocation modes", () => {
    const prompt = "Explain $$, $&, $`, $', $1 and {prompt}";
    const claude = getHarness("claude");
    const codex = getHarness("codex");

    for (const built of [
      claude.buildInvocation(prompt),
      claude.buildInvocation(prompt, { structured: true }),
      claude.buildInvocation(prompt, { tools: true }),
      claude.buildInvocation(prompt, { tools: true, structured: true }),
      codex.buildInvocation(prompt, { readOnly: true }),
      codex.buildInvocation(prompt, { readOnly: true, structured: true }),
    ]) {
      expect(built?.args).toContain(prompt);
    }
  });

  it("delivers replacement tokens unchanged to the child process", async () => {
    const prompt = "Explain $$, $&, $`, $', $1 and {prompt}";
    const result = await new FakeCursor().invoke(prompt, { structured: true });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ advisor: prompt });
  });

  it("keeps Claude advisor runs free of built-in and MCP tools", () => {
    const claude = getHarness("claude");
    expect(claude.buildInvocation("answer this")).toEqual({
      command: "claude",
      args: ["-p", "answer this", "--strict-mcp-config", "--tools", ""],
    });
    expect(claude.buildInvocation("answer this", { structured: true })).toEqual({
      command: "claude",
      args: ["-p", "--output-format", "json", "answer this", "--strict-mcp-config", "--tools", ""],
    });
    expect(claude.buildInvocation("answer this", { model: "sonnet" })).toEqual({
      command: "claude",
      args: ["-p", "answer this", "--strict-mcp-config", "--tools", "", "--model", "sonnet"],
    });
  });

  it("keeps Claude read-only runs on its built-in inspection tools", () => {
    const claude = getHarness("claude");

    expect(claude.invocation?.readOnlyMinVersion).toBe("2.1.175");
    expect(claude.buildInvocation("review this", { readOnly: true })).toEqual({
      command: "claude",
      args: ["-p", "review this", "--strict-mcp-config", "--tools", "Read,Glob,Grep"],
    });
    expect(claude.buildInvocation("review this", { readOnly: true, structured: true })).toEqual({
      command: "claude",
      args: [
        "-p",
        "--output-format",
        "json",
        "review this",
        "--strict-mcp-config",
        "--tools",
        "Read,Glob,Grep",
      ],
    });
    expect(claude.buildInvocation("review this", { readOnly: true, model: "sonnet" })).toEqual({
      command: "claude",
      args: [
        "-p",
        "review this",
        "--strict-mcp-config",
        "--tools",
        "Read,Glob,Grep",
        "--model",
        "sonnet",
      ],
    });
  });

  it("uses the full agent invocation only when tools are enabled", () => {
    const claude = getHarness("claude");
    expect(claude.buildInvocation("do the thing", { tools: true })).toEqual({
      command: "claude",
      args: ["-p", "do the thing"],
    });
  });

  it("allows Codex to run outside Git without widening read-only access", () => {
    const codex = getHarness("codex");

    expect([
      codex.buildInvocation("review this", { tools: true }),
      codex.buildInvocation("review this", { tools: true, structured: true }),
      codex.buildInvocation("review this", { readOnly: true }),
      codex.buildInvocation("review this", { readOnly: true, structured: true }),
    ]).toEqual([
      {
        command: "codex",
        args: ["exec", "--skip-git-repo-check", "review this"],
      },
      {
        command: "codex",
        args: ["exec", "--skip-git-repo-check", "--json", "review this"],
      },
      {
        command: "codex",
        args: ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "review this"],
      },
      {
        command: "codex",
        args: ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--json", "review this"],
      },
    ]);
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

  it("runs Prime Agent advisor and agent modes without a read-only recipe", () => {
    const primeAgent = getHarness("prime-agent");

    expect(primeAgent.buildInvocation("review this")).toEqual({
      command: "prime-agent",
      args: ["-p", "--no-tools", "review this"],
    });
    expect(primeAgent.buildInvocation("review this", { structured: true })).toEqual({
      command: "prime-agent",
      args: ["-p", "--no-tools", "--mode", "json", "review this"],
    });
    expect(primeAgent.buildInvocation("review this", { tools: true })).toEqual({
      command: "prime-agent",
      args: ["-p", "review this"],
    });
    expect(
      primeAgent.buildInvocation("review this", {
        tools: true,
        structured: true,
        model: "gpt-5.4",
      }),
    ).toEqual({
      command: "prime-agent",
      args: ["-p", "--mode", "json", "review this", "--model", "gpt-5.4"],
    });
    expect(primeAgent.invocationError({ readOnly: true })).toContain(
      "no read-only full agent invocation",
    );
  });

  it("runs Grok read-only jobs inside its native sandbox", () => {
    const grok = getHarness("grok");

    expect(grok.invocationError({ readOnly: true })).toBeNull();
    expect(grok.buildInvocation("review this", { readOnly: true })).toEqual({
      command: "grok",
      args: ["-p", "review this", "--sandbox", "read-only"],
    });
    expect(grok.buildInvocation("review this", { readOnly: true, structured: true })).toEqual({
      command: "grok",
      args: ["-p", "review this", "--sandbox", "read-only", "--output-format", "json"],
    });
  });

  it("rejects OMP advisor mode because --no-tools only disables bundled tools", () => {
    const omp = getHarness("omp");

    expect(omp.buildInvocation("review this")).toBeNull();
    expect(omp.invocationError()).toContain("no advisor without tools invocation");
    expect(omp.buildInvocation("review this", { tools: true })).toEqual({
      command: "omp",
      args: ["-p", "review this"],
    });
    expect(omp.buildInvocation("review this", { tools: true, structured: true })).toEqual({
      command: "omp",
      args: ["-p", "--mode", "json", "review this"],
    });
  });

  it("rejects read-only access when a harness cannot enforce it", () => {
    expect(getHarness("gemini").invocationError({ readOnly: true })).toContain(
      "no read-only full agent invocation",
    );
  });

  it("rejects read-only access with tools explicitly disabled", () => {
    const conflict = { tools: false, readOnly: true };
    const claude = getHarness("claude");

    expect(claude.buildInvocation("review this", conflict)).toBeNull();
    expect(claude.invocationError(conflict)).toBe(
      "Harness claude cannot run readOnly with tools: false, since read-only access still uses tools; " +
        "retry with tools: true to keep its read-only tools, or with readOnly: false to use its advisor without tools",
    );
    expect(claude.buildInvocation("review this", { readOnly: true })).not.toBeNull();
    expect(getHarness("codex").invocationError(conflict)).toMatch(
      /; retry with tools: true to keep its read-only tools$/,
    );
    expect(getHarness("prime-agent").invocationError(conflict)).toMatch(
      /; retry with readOnly: false to use its advisor without tools$/,
    );
    expect(getHarness("cursor").invocationError(conflict)).toBe(
      "Harness cursor cannot run readOnly with tools: false, since read-only access still uses tools",
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

/**
 * Builds one Claude `stream-json` line in the shape 2.1.280 prints, trimmed to the fields the fold reads.
 *
 * @param event - The inner stream event.
 * @returns {string} The event line.
 */
function claudeEvent(event: object): string {
  return `${JSON.stringify({ type: "stream_event", event })}\n`;
}

const CLAUDE_STREAM_START =
  `${JSON.stringify({ type: "system", subtype: "init" })}\n` +
  claudeEvent({ type: "message_start" }) +
  claudeEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking" } }) +
  claudeEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta" } }) +
  claudeEvent({
    type: "content_block_start",
    index: 1,
    content_block: { type: "text", text: "" },
  }) +
  claudeEvent({
    type: "content_block_delta",
    index: 1,
    delta: { type: "text_delta", text: "Rivers " },
  }) +
  claudeEvent({
    type: "content_block_delta",
    index: 1,
    delta: { type: "text_delta", text: "flow." },
  });

describe("Claude stream folding", () => {
  it("returns the result text exactly as plain print mode prints it", () => {
    const stdout =
      CLAUDE_STREAM_START +
      `${JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Rivers flow." })}\n`;

    expect(foldClaudeStream(stdout, true)).toBe("Rivers flow.\n");
  });

  it("keeps an error result, which plain print mode also prints on stdout", () => {
    const message = "There's an issue with the selected model (nonexistent-xyz).";
    const stdout = `${JSON.stringify({ type: "result", subtype: "success", is_error: true, result: message })}\n`;

    expect(foldClaudeStream(stdout, true)).toBe(`${message}\n`);
  });

  it("returns the text streamed before a stop and drops the event it cut", () => {
    const stdout =
      CLAUDE_STREAM_START +
      claudeEvent({ type: "content_block_start", index: 2, content_block: { type: "tool_use" } }) +
      claudeEvent({
        type: "content_block_start",
        index: 3,
        content_block: { type: "text", text: "" },
      }) +
      claudeEvent({
        type: "content_block_delta",
        index: 3,
        delta: { type: "text_delta", text: "Then" },
      }) +
      '{"type":"stream_event","event":{"type":"content_block_delta","index":3,"delta":{"type":"text_';

    expect(foldClaudeStream(stdout, false)).toBe("Rivers flow.\n\nThen\n");
  });

  it("passes through lines that are not events", () => {
    expect(foldClaudeStream(`Error: something broke\n${CLAUDE_STREAM_START}`, true)).toBe(
      "Error: something broke\nRivers flow.\n",
    );
  });

  it("keeps JSON output that is not a protocol message", () => {
    const warning = '{"warning":"using fallback model"}';
    expect(foldClaudeStream(`${warning}\n${CLAUDE_STREAM_START}`, true)).toBe(
      `${warning}\nRivers flow.\n`,
    );
  });

  it("keeps a whole last event that a stop left without its newline", () => {
    const stdout = CLAUDE_STREAM_START.slice(0, -1);

    expect(foldClaudeStream(stdout, false)).toBe("Rivers flow.\n");
  });

  it("returns nothing for a run stopped before any text", () => {
    expect(
      foldClaudeStream(`${JSON.stringify({ type: "system", subtype: "init" })}\n`, false),
    ).toBe("");
  });

  it("streams plain runs only", () => {
    const claude = new Claude();
    expect(claude.invocation?.streamArgs).toEqual([
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
    ]);
    expect(claude.buildInvocation("x")?.args).not.toContain("stream-json");
  });
});

describe("streamed invocation", () => {
  const events = JSON.stringify(CLAUDE_STREAM_START);
  const script = `process.stdout.write(${events}); if (process.argv.includes('stream-json')) setTimeout(() => {}, 60000);`;

  class StreamingClaude extends Claude {
    override readonly binaries = [process.execPath];
    override readonly invocation: Harness["invocation"] = {
      args: ["-e", script],
      jsonArgs: ["-e", "console.log('{}')"],
      streamArgs: ["stream-json"],
      level: "inferred",
    };
  }

  it("keeps the text written before a timeout, with the time since the last output", async () => {
    const result = await new StreamingClaude().invoke("x", { tools: true, timeoutMs: 400 });

    expect(result).toMatchObject({ timedOut: true, exitCode: null, stdout: "Rivers flow.\n" });
    expect(result.args).toContain("stream-json");
    expect(result.idleMs).toBeGreaterThan(0);
    expect(result.idleMs).toBeLessThanOrEqual(400);
  });

  it("leaves structured runs unstreamed", async () => {
    const result = await new StreamingClaude().invoke("x", { tools: true, structured: true });

    expect(result.stdout).toBe("{}\n");
    expect(result.args).not.toContain("stream-json");
  });

  it("reports the idle time of a run that printed nothing", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly binaries = [process.execPath];
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "setTimeout(() => {}, 60000)"],
          level: "inferred",
        };
      },
    );
    try {
      const result = await runHarness("cursor", "x", { tools: true, timeoutSeconds: 0.3 });

      expect(result.details).toMatchObject({ timedOut: true, stdout: "" });
      const idleMs = "idleMs" in result.details ? result.details.idleMs : undefined;
      expect(idleMs).toBeGreaterThanOrEqual(250);
      expect(result.content[0]?.text).toContain(`idleMs: ${idleMs}`);
    } finally {
      registerHarness(Cursor);
    }
  });

  it("reports the idle time of a model listing that timed out", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly binaries = [process.execPath];
        override readonly modelListing: Harness["modelListing"] = {
          args: ["-e", "setTimeout(() => {}, 60000)"],
          level: "inferred",
        };
      },
    );
    try {
      const result = await listHarnessModels("cursor", { timeoutSeconds: 0.3 });

      expect(result.details).toMatchObject({ timedOut: true });
      expect("idleMs" in result.details ? result.details.idleMs : undefined).toBeGreaterThanOrEqual(
        250,
      );
    } finally {
      registerHarness(Cursor);
    }
  });

  it("keeps a multibyte character split across two writes", async () => {
    const script =
      "process.stdout.write(Buffer.from([0xc5])); setTimeout(() => process.stdout.write(Buffer.from([0x82, 0x0a])), 50)";
    const fake = new (class extends FakeCursor {
      override readonly binaries = [process.execPath];
      override readonly invocation: Harness["invocation"] = {
        args: ["-e", script],
        level: "inferred",
      };
    })();

    expect((await fake.invoke("x", { tools: true })).stdout).toBe("ł\n");
  });

  it("leaves idleMs out when the run exits on its own", async () => {
    const result = await new StreamingClaude().invoke("x", { tools: true, structured: true });

    expect(result).not.toHaveProperty("idleMs");
  });
});

describe.each(["invoke", "listModels"] as const)("%s cancellation cleanup", (operation) => {
  it("does not spawn a command when the signal is already aborted", async () => {
    const fake = new (class extends FakeCursor {
      override readonly binaries = [join(tmpdir(), "agntn-missing-harness-binary")];
      override readonly modelListing: Harness["modelListing"] = { args: [], level: "inferred" };
    })();
    const options = { signal: AbortSignal.abort() };
    const result = await (operation === "invoke"
      ? fake.invoke("x", options)
      : fake.listModels(options));
    expect(result).toMatchObject({
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      aborted: true,
    });
    if (operation === "listModels") expect(result).toHaveProperty("models", []);
  });

  it("removes listeners after completion and ignores a later abort", async () => {
    const args = ["-e", "console.log('done')"];
    const fake = new (class extends FakeCursor {
      override readonly binaries = [process.execPath];
      override readonly invocation: Harness["invocation"] = { args, level: "inferred" };
      override readonly modelListing: Harness["modelListing"] = { args, level: "inferred" };
      override parseModelListingOutput(): [] {
        return [];
      }
    })();
    const controller = new AbortController();
    const options = { signal: controller.signal, tools: true };
    const result = await (operation === "invoke"
      ? fake.invoke("x", options)
      : fake.listModels(options));
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    controller.abort();
    expect(result).toMatchObject({
      stdout: "done\n",
      exitCode: 0,
      timedOut: false,
      aborted: false,
    });
  });

  it("removes listeners after a spawn error", async () => {
    const fake = new (class extends FakeCursor {
      override readonly binaries = [join(tmpdir(), "agntn-missing-harness-binary")];
      override readonly modelListing: Harness["modelListing"] = { args: [], level: "inferred" };
    })();
    const controller = new AbortController();
    const options = { signal: controller.signal, timeoutMs: 1000 };
    await expect(
      operation === "invoke" ? fake.invoke("x", options) : fake.listModels(options),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    controller.abort();
  });

  it.each(["abort", "timeout"] as const)("keeps %s as the first stop reason", async (first) => {
    const args = ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 3000)"];
    const fake = new (class extends FakeCursor {
      override readonly binaries = [process.execPath];
      override readonly invocation: Harness["invocation"] = { args, level: "inferred" };
      override readonly modelListing: Harness["modelListing"] = { args, level: "inferred" };
    })();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), first === "abort" ? 100 : 200);
    try {
      const options = {
        signal: controller.signal,
        timeoutMs: first === "timeout" ? 100 : 200,
        tools: true,
      };
      const result = await (operation === "invoke"
        ? fake.invoke("x", options)
        : fake.listModels(options));
      expect(result).toMatchObject({
        exitCode: null,
        aborted: first === "abort",
        timedOut: first === "timeout",
      });
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      clearTimeout(timer);
    }
  });
});

describe.each(["invoke", "listModels"] as const)("%s spawn failures", (operation) => {
  class NodeHarness extends FakeCursor {
    override readonly binaries = [process.execPath];
    override readonly invocation: Harness["invocation"] = { args: ["-e", ""], level: "inferred" };
    override readonly modelListing: Harness["modelListing"] = {
      args: ["-e", ""],
      level: "inferred",
    };
  }
  const run = (fake: Harness, cwd: string) =>
    operation === "invoke" ? fake.invoke("x", { cwd, tools: true }) : fake.listModels({ cwd });

  it("names a missing working directory instead of the installed binary", async () => {
    const cwd = join(tmpdir(), "agntn-missing-harness-cwd");
    await expect(run(new NodeHarness(), cwd)).rejects.toMatchObject({
      code: "ENOENT",
      message: `Working directory not found: ${cwd}`,
    });
  });

  it("names a working directory that is a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-cwd-"));
    try {
      const cwd = join(directory, "file");
      await writeFile(cwd, "");
      await expect(run(new NodeHarness(), cwd)).rejects.toMatchObject({
        message: `Working directory is not a directory: ${cwd}`,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("names a missing binary", async () => {
    const binary = join(tmpdir(), "agntn-missing-harness-binary");
    const fake = new (class extends NodeHarness {
      override readonly binaries = [binary];
    })();
    await expect(run(fake, tmpdir())).rejects.toMatchObject({
      code: "ENOENT",
      message: `Command not found: ${binary}. Install it or add it to PATH`,
    });
  });
});

describe.each([
  ["invoke", "deadline"],
  ["listModels", "deadline"],
  ["invoke", "cancellation"],
  ["listModels", "cancellation"],
] as const)("%s %s cleanup", (operation, cause) => {
  const timeoutMs = cause === "deadline" ? 1000 : 0;
  it("preserves output and exit status when the command finishes before its deadline", async () => {
    const args = ["-e", "console.log('out'); console.error('err'); process.exitCode = 3"];
    const fake = new (class extends FakeCursor {
      override readonly binaries = [process.execPath];
      override readonly invocation: Harness["invocation"] = { args, level: "inferred" };
      override readonly modelListing: Harness["modelListing"] = { args, level: "inferred" };
    })();
    const options = { timeoutMs, signal: new AbortController().signal, tools: true };
    const result = await (operation === "invoke"
      ? fake.invoke("x", options)
      : fake.listModels(options));
    expect(result).toMatchObject({
      stdout: "out\n",
      stderr: "err\n",
      exitCode: 3,
      timedOut: false,
    });
  });

  it("rejects a spawn failure without waiting for its deadline", async () => {
    const fake = new (class extends FakeCursor {
      override readonly binaries = [join(tmpdir(), "agntn-missing-harness-binary")];
      override readonly modelListing: Harness["modelListing"] = { args: [], level: "inferred" };
    })();
    const options = { timeoutMs, signal: new AbortController().signal };
    await expect(
      operation === "invoke" ? fake.invoke("x", options) : fake.listModels(options),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["ignore", "grace", "inherit", "ignore-stdio"] as const)(
    "cleans up the %s fixture within the deadline and cleanup budget",
    async (mode) => {
      const directory = await mkdtemp(join(tmpdir(), "harness-timeout-"));
      const leaf = `
        const { writeFileSync } = require('node:fs');
        const { join } = require('node:path');
        process.on('SIGTERM', () => {});
        writeFileSync(join(process.argv[1], 'leaf'), String(process.pid));
        setTimeout(() => process.exit(0), 5000);
      `;
      const script = `
        const { writeFileSync } = require('node:fs');
        const { join } = require('node:path');
        writeFileSync(join(process.argv[1], 'root'), String(process.pid));
        if (process.argv[2] === 'ignore' || process.argv[2] === 'grace') {
          process.on('SIGTERM', () => {
            if (process.argv[2] === 'grace') {
              setTimeout(() => { console.log('cleaned'); process.exit(0); }, 100);
            }
          });
          console.log('ready');
        } else {
          require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(leaf)}, process.argv[1]], {
            stdio: process.argv[2] === 'inherit' ? 'inherit' : 'ignore'
          });
        }
        setTimeout(() => process.exit(0), 5000);
      `;
      const args = ["-e", script, directory, mode];
      const fake = new (class extends FakeCursor {
        override readonly binaries = [process.execPath];
        override readonly invocation: Harness["invocation"] = { args, level: "inferred" };
        override readonly modelListing: Harness["modelListing"] = { args, level: "inferred" };
      })();

      try {
        const start = performance.now();
        const controller = new AbortController();
        const options = {
          timeoutMs,
          signal: cause === "cancellation" ? controller.signal : undefined,
          tools: true,
        };
        const abortTimer = setTimeout(() => controller.abort(), 1000);
        const result = await (
          operation === "invoke" ? fake.invoke("x", options) : fake.listModels(options)
        ).finally(() => clearTimeout(abortTimer));

        expect(result.timedOut).toBe(cause === "deadline");
        expect(result.aborted).toBe(cause === "cancellation");
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
        expect(result.exitCode).toBeNull();
        expect(performance.now() - start).toBeLessThan(3000);
        const rootOnly = mode === "ignore" || mode === "grace";
        if (rootOnly) {
          expect(result.stdout).toBe(
            mode === "grace" && process.platform !== "win32" ? "ready\ncleaned\n" : "ready\n",
          );
        }
        const names = await readdir(directory);
        expect(names.sort()).toEqual(rootOnly ? ["root"] : ["leaf", "root"]);
        for (const name of names) {
          const pid = Number(await readFile(join(directory, name), "utf8"));
          await expect.poll(() => processIsRunning(pid), { timeout: 1000 }).toBe(false);
        }
      } finally {
        await cleanupFixture(directory);
      }
    },
    10000,
  );
});

async function cleanupFixture(directory: string): Promise<void> {
  for (const name of await readdir(directory)) {
    const pid = Number(await readFile(join(directory, name), "utf8"));
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }
  await rm(directory, { recursive: true, force: true });
}

/**
 * Linux may retain an orphan's PID as a zombie after it has stopped executing.
 * @param pid - PID written by a fixture process.
 * @returns {Promise<boolean>} Whether the process can still execute.
 */
async function processIsRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z";
    }
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["ESRCH", "ENOENT"].includes(String(error.code))
    ) {
      return false;
    }
    throw error;
  }
}

describe("harness metadata for agents", () => {
  it("exposes invocation modes through the harness API", () => {
    expect(getHarness("claude").invocationModes).toEqual({
      advisor: true,
      advisorStructured: true,
      readOnly: true,
      readOnlyStructured: true,
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
  it("reports cancellation through both shared tool operations", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly binaries = [join(tmpdir(), "agntn-missing-harness-binary")];
        override readonly modelListing: Harness["modelListing"] = { args: [], level: "inferred" };
      },
    );
    try {
      const options = { signal: AbortSignal.abort() };
      for (const result of [
        await runHarness("cursor", "x", options),
        await listHarnessModels("cursor", options),
      ]) {
        expect(result.isError).toBe(true);
        expect(result.details).toMatchObject({ aborted: true, timedOut: false, exitCode: null });
        expect(result.content[0]?.text).toContain("aborted: true");
      }
    } finally {
      registerHarness(Cursor);
    }
  });
  it("flags an unknown harness id", async () => {
    const result = await runHarness("nope", "x");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Unknown harness: nope");
  });

  it("tells the agent when the working directory is missing", async () => {
    const cwd = join(tmpdir(), "agntn-missing-harness-cwd");
    const result = await runHarness("claude", "x", { cwd });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({
      error: `Failed to run claude: Working directory not found: ${cwd}`,
    });
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

  it("hands the model the output as plain text under the status block", async () => {
    const answer = [
      "- **200 OK**: the request went through.",
      "",
      "```bash",
      'curl -X POST "https://api.example.com/items" \\',
      '  -d "{\\"name\\": \\"test\\"}"',
      "```",
      "",
    ].join("\n");
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", `process.stdout.write(${JSON.stringify(answer)})`],
          level: "inferred",
        };
      },
    );

    try {
      const result = await runHarness("cursor", "x", { tools: true });

      expect(result.isError).toBeUndefined();
      const content = result.content[0]?.text ?? "";
      const [status, output, ...rest] = content.split("\n\nstdout:\n");
      expect(rest).toEqual([]);
      expect(fromToon(status ?? "")).toMatchObject({ id: "cursor", exitCode: 0, tools: true });
      expect(output).toBe(answer);
      expect(content).not.toContain('stdout: "');
    } finally {
      registerHarness(Cursor);
    }
  });

  it("keeps terminal controls out of the text and in the details", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: [
            "-e",
            "process.stdout.write('\\u001B[31mred\\u001B[0m line\\r\\nbell\\u0007 end\\n')",
          ],
          level: "inferred",
        };
      },
    );

    try {
      const result = await runHarness("cursor", "x", { tools: true });

      const content = result.content[0]?.text ?? "";
      expect(content).toContain("\n\nstdout:\nred line\nbell  end\n");
      for (const control of ["\u001B", "\u0007", "\r"]) expect(content).not.toContain(control);
      expect(result.details).toMatchObject({
        stdout: "\u001B[31mred\u001B[0m line\r\nbell\u0007 end\n",
      });
    } finally {
      registerHarness(Cursor);
    }
  });

  it("labels both streams when the run fails", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('partial'); console.error('boom'); process.exit(2)"],
          level: "inferred",
        };
      },
    );

    try {
      const result = await runHarness("cursor", "x", { tools: true });

      expect(result.isError).toBe(true);
      const content = result.content[0]?.text ?? "";
      expect(content).toContain("exitCode: 2\n");
      expect(content).toContain("\n\nstdout:\npartial\n");
      expect(content).toContain("\n\nstderr:\nboom\n");
      expect(content).not.toContain('stdout: "');
    } finally {
      registerHarness(Cursor);
    }
  });

  it("keeps successful stderr out of content sent to the model", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('answer'); console.error(['trace', 'noise'].join('-'))"],
          level: "inferred",
        };
      },
    );

    try {
      const result = await runHarness("cursor", "x", { tools: true });

      expect(result.isError).toBeUndefined();
      expect(result.details).toMatchObject({ stdout: "answer\n", stderr: "trace-noise\n" });
      expect(result.content[0]?.text).toContain("answer");
      expect(result.content[0]?.text).not.toContain("trace-noise");
    } finally {
      registerHarness(Cursor);
    }
  });

  it("keeps the prompt out of content sent to the model", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('answer')", "{prompt}"],
          noToolsArgs: ["-e", "console.error('trace'); process.exit(3)", "{prompt}"],
          modelArgs: ["--model", "{model}"],
          level: "inferred",
        };
      },
    );
    const prompt = "Here is a long document the model already wrote";

    try {
      for (const options of [
        { tools: true, model: "fast" },
        { tools: false, model: "fast" },
      ]) {
        const result = await runHarness("cursor", prompt, options);
        const content = result.content[0]?.text ?? "";

        expect((result.details as { args: string[] }).args).toContain(prompt);
        expect(content).toContain("{prompt}");
        expect(content).toContain("--model");
        expect(content).not.toContain(prompt);
        expect(content).toContain(options.tools ? "answer" : "trace");
      }
    } finally {
      registerHarness(Cursor);
    }
  });

  it("uses successful stderr when the harness returns no stdout", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.error(['only', 'stderr'].join('-'))"],
          level: "inferred",
        };
      },
    );

    try {
      const result = await runHarness("cursor", "x", { tools: true });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("only-stderr");
    } finally {
      registerHarness(Cursor);
    }
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

    try {
      const result = await runHarness("cursor", "review", { readOnly: true });

      expect(result.isError).toBeUndefined();
      expect(result.details).toMatchObject({
        stdout: "read:review\n",
        tools: true,
        readOnly: true,
      });
    } finally {
      registerHarness(Cursor);
    }
  });

  it("refuses read-only runs with tools disabled before spawning anything", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnesses-read-only-"));
    const marker = join(dir, "spawned");
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('write')"],
          noToolsArgs: ["-e", "console.log('advisor')"],
          readOnlyArgs: ["-e", "require('node:fs').writeFileSync(process.argv[1], '')", marker],
          level: "inferred",
        };
      },
    );

    try {
      const result = await runHarness("cursor", "review", { tools: false, readOnly: true });

      expect(result.isError).toBe(true);
      expect(result.details).not.toHaveProperty("exitCode");
      expect(result.content[0]?.text).toContain(
        "retry with tools: true to keep its read-only tools, or with readOnly: false",
      );
      expect(await readdir(dir)).toEqual([]);

      const advisor = await runHarness("cursor", "review", { tools: false });
      expect(advisor.details).toMatchObject({ stdout: "advisor\n", tools: false, readOnly: false });
    } finally {
      registerHarness(Cursor);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses read-only runs below the verified CLI version", async () => {
    const versions: Array<string | null> = ["1.0.5", "1.0.13-alpha.2", null];
    for (const installed of versions) {
      registerHarness(
        class extends FakeCursor {
          override readonly invocation: Harness["invocation"] = {
            args: ["-e", "console.log('write')"],
            readOnlyArgs: ["-e", "console.log('read')", "{prompt}"],
            readOnlyMinVersion: "1.0.13",
            level: "inferred",
          };
          override get version(): string | null {
            return installed;
          }
        },
      );

      try {
        const result = await runHarness("cursor", "review", { tools: true, readOnly: true });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain(
          `requires version 1.0.13 or newer for read-only runs; installed ${installed ?? "version unknown"}`,
        );
        expect(result.details).not.toHaveProperty("retry");

        const agent = await runHarness("cursor", "review", { tools: true });
        expect(agent.isError).toBeUndefined();
      } finally {
        registerHarness(Cursor);
      }
    }
  });

  it("runs read-only jobs once the installed CLI meets the verified version", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('write')"],
          readOnlyArgs: ["-e", "console.log('read:' + process.argv[1])", "{prompt}"],
          readOnlyMinVersion: "1.0.13",
          level: "inferred",
        };
        override get version(): string | null {
          return "1.0.25";
        }
      },
    );

    try {
      const result = await runHarness("cursor", "review", { tools: true, readOnly: true });

      expect(result.isError).toBeUndefined();
      expect(result.details).toMatchObject({ stdout: "read:review\n", readOnly: true });
    } finally {
      registerHarness(Cursor);
    }
  });

  it("keeps unsupported read-only access from widening to a full agent", async () => {
    const result = await runHarness("omp", "inspect", { tools: true, readOnly: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no read-only full agent invocation");
    expect(result.details).not.toHaveProperty("retry");
  });

  it("marks a non-zero exit as an error and truncates long output", async () => {
    registerHarness(
      class extends FakeCursor {
        override readonly invocation: Harness["invocation"] = {
          args: [
            "-e",
            "console.log('x'.repeat(20000)); console.error(['failure', 'trace'].join('-')); process.exit(3)",
          ],
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
    expect(result.content[0]?.text).toContain("failure-trace");
  });
});
