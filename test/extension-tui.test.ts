import { validateInput } from "@agntn/tools";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@oh-my-pi/pi-coding-agent", () => ({
  Text: class {
    readonly text: string;

    constructor(text: string) {
      this.text = text;
    }

    render(): string[] {
      return [this.text];
    }
  },
}));

import ompExtension from "../extensions/omp/harnesses.ts";
import piExtension from "../extensions/pi/harnesses.ts";
import { HARNESS_TOOL_APPROVALS, HARNESS_TOOL_LABELS } from "../extensions/shared/tui.ts";
import { registerHarness } from "../src/index.ts";
import { harnessesTools } from "../src/tools.ts";
import { Harness } from "../src/harness.ts";
import Cursor from "../src/harnesses/cursor.ts";

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function registeredTools(
  extension: typeof piExtension | typeof ompExtension,
  omp = false,
): Promise<unknown[]> {
  const tools: unknown[] = [];
  const api = {
    on() {},
    registerTool(tool: unknown) {
      tools.push(tool);
    },
    /* `Unsafe` hands the schema over as is, so the test sees what OMP's validator gets. */
    ...(omp ? { setLabel() {}, typebox: { Type: { Unsafe: (schema: unknown) => schema } } } : {}),
  };
  await Reflect.apply(extension, undefined, [api]);
  return tools;
}

function tool(tools: readonly unknown[], name: string): Record<string, unknown> {
  const found = tools.find((candidate) => isRecord(candidate) && candidate.name === name);
  if (!isRecord(found)) throw new Error(`Tool not registered: ${name}`);
  return found;
}

async function expectFailure(
  definition: Readonly<Record<string, unknown>>,
  args: readonly unknown[],
  message: string,
): Promise<void> {
  if (typeof definition.execute !== "function") throw new Error("Missing execute");
  const settled: unknown = await Reflect.apply(definition.execute, definition, ["call", ...args]);
  if (!isRecord(settled) || !Array.isArray(settled.content)) throw new Error("Missing content");
  expect(settled.isError).toBe(true);
  expect(settled.details).toBeDefined();
  const texts: unknown[] = settled.content.map((part: unknown) => isRecord(part) && part.text);
  expect(texts.join("\n")).toContain(message);
}

function render(component: unknown): string {
  if (!isRecord(component) || typeof component.render !== "function") {
    throw new Error("Renderer did not return a component");
  }
  const lines: unknown = Reflect.apply(component.render, component, [120]);
  if (!Array.isArray(lines) || lines.some((line) => typeof line !== "string")) {
    throw new Error("Component returned invalid lines");
  }
  return lines.join("\n");
}

function renderCall(definition: Readonly<Record<string, unknown>>, omp: boolean): string {
  if (typeof definition.renderCall !== "function") throw new Error("Missing renderCall");
  const args = { id: "pi", prompt: `inspect\u001B]8;;https://example.com\u0007${"x".repeat(500)}` };
  const rendererArgs = omp
    ? [args, { isPartial: true, spinnerFrame: 0 }, plainTheme]
    : [args, plainTheme, { executionStarted: true, isPartial: true }];
  return render(Reflect.apply(definition.renderCall, definition, rendererArgs));
}

function renderResult(definition: Readonly<Record<string, unknown>>, omp: boolean): string {
  if (typeof definition.renderResult !== "function") throw new Error("Missing renderResult");
  const result = { details: { id: "pi", name: "Pi\u001B[31m Agent" } };
  const rendererArgs = omp
    ? [result, { isPartial: false }, plainTheme]
    : [result, { isPartial: false }, plainTheme, { isError: false }];
  return render(Reflect.apply(definition.renderResult, definition, rendererArgs));
}

const piTools = await registeredTools(piExtension);
const ompTools = await registeredTools(ompExtension, true);

describe("Pi and OMP extension renderers", () => {
  it("registers custom renderers for every tool in both hosts", () => {
    const expected = Object.keys(HARNESS_TOOL_LABELS).sort();
    const names = (tools: readonly unknown[]) =>
      tools.flatMap((definition) =>
        isRecord(definition) && typeof definition.name === "string" ? [definition.name] : [],
      );

    expect(names(piTools).sort()).toEqual(expected);
    expect(names(ompTools).sort()).toEqual(expected);

    for (const definition of [...piTools, ...ompTools]) {
      expect(isRecord(definition) && typeof definition.renderCall).toBe("function");
      expect(isRecord(definition) && typeof definition.renderResult).toBe("function");
    }
  });

  it("returns retry guidance through both host adapters", async () => {
    for (const definitions of [piTools, ompTools]) {
      await expectFailure(
        tool(definitions, "harnesses_run"),
        [{ id: "github-copilot", prompt: "inspect", structured: true, tools: false }],
        "retry with structured: false and tools: true",
      );
    }
  });

  it("hands extensions: false from both hosts to the run", async () => {
    for (const definitions of [piTools, ompTools]) {
      await expectFailure(
        tool(definitions, "harnesses_run"),
        [{ id: "claude", prompt: "x", tools: false, extensions: false }],
        "Harness claude cannot start without extensions",
      );
    }
  });

  it("forwards cancellation from both hosts to runs and model listings", async () => {
    const hang = { args: ["-e", "setTimeout(() => {}, 30_000)"], level: "inferred" } as const;
    registerHarness(
      class extends Cursor {
        override readonly binaries = ["node"];
        override readonly invocation: Harness["invocation"] = hang;
        override readonly modelListing: Harness["modelListing"] = hang;
      },
    );
    try {
      for (const definitions of [piTools, ompTools]) {
        for (const [name, args] of [
          ["harnesses_run", { id: "cursor", prompt: "x", tools: true }],
          ["harnesses_models", { id: "cursor" }],
        ] as const) {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 200);
          await expectFailure(tool(definitions, name), [args, controller.signal], "aborted");
        }
      }
    } finally {
      registerHarness(Cursor);
    }
  });

  it("keeps failed run output in both host errors", async () => {
    registerHarness(
      class extends Cursor {
        override readonly binaries = ["node"];
        override readonly invocation: Harness["invocation"] = {
          args: ["-e", "console.log('partial-result'); process.exit(3)"],
          level: "inferred",
        };
      },
    );

    try {
      for (const definitions of [piTools, ompTools]) {
        await expectFailure(
          tool(definitions, "harnesses_run"),
          [{ id: "cursor", prompt: "inspect", tools: true }],
          "partial-result",
        );
      }
    } finally {
      registerHarness(Cursor);
    }
  });

  it.each([
    ["harnesses_info", { id: "unknown" }],
    ["harnesses_mcp_list", { id: "unknown" }],
    ["harnesses_mcp_add", { id: "unknown", name: "probe", command: "probe" }],
    ["harnesses_mcp_remove", { id: "unknown", name: "probe" }],
    ["harnesses_mcp_sync", { id: "unknown" }],
    ["harnesses_agents_sync", { id: "unknown" }],
    ["harnesses_prompts_sync", { id: "unknown" }],
    ["harnesses_skills_sync", { id: "unknown" }],
  ])("marks a failed %s result as an error in both hosts", async (name, args) => {
    for (const definitions of [piTools, ompTools]) {
      await expectFailure(tool(definitions, name), [args], "Unknown harness: unknown");
    }
  });

  it("prepares serialized Pi metadata batches before validation", () => {
    const definition = tool(piTools, "harnesses_info");
    if (typeof definition.prepareArguments !== "function") {
      throw new TypeError("Missing argument preparation");
    }
    const info = harnessesTools.find((candidate) => candidate.name === "harnesses_info");
    if (!info) throw new TypeError("Missing harnesses_info");
    const accepts = (args: unknown) => validateInput(info, args).ok;

    const raw = { id: '["pi","omp"]' };
    expect(accepts(raw)).toBe(false);
    const prepared: unknown = Reflect.apply(definition.prepareArguments, definition, [raw]);
    expect(prepared).toEqual({ id: ["pi", "omp"] });
    expect(accepts(prepared)).toBe(true);

    for (const [input, valid] of [
      [{ id: "pi" }, true],
      [{ id: ["pi", "omp"] }, true],
      [{ id: '["pi",1]' }, false],
      [{ id: "[broken" }, false],
    ] as const) {
      const unchanged: unknown = Reflect.apply(definition.prepareArguments, definition, [input]);
      expect(unchanged).toEqual(input);
      expect(accepts(unchanged)).toBe(valid);
    }

    for (const input of [
      { id: "[]" },
      { id: JSON.stringify(Array.from({ length: 21 }, () => "pi")) },
      { id: '["Nope!"]' },
    ]) {
      const invalid: unknown = Reflect.apply(definition.prepareArguments, definition, [input]);
      expect(accepts(invalid)).toBe(false);
    }
  });

  it("rejects arguments the schema does not declare in both hosts", async () => {
    const stray = { id: "claude", prompt: "inspect", tools: true, read_only: true };
    for (const definitions of [piTools, ompTools]) {
      const run = tool(definitions, "harnesses_run");
      if (typeof run.execute !== "function") throw new Error("Missing execute");
      await expect(Reflect.apply(run.execute, run, ["call", stray])).rejects.toThrow(
        'unknown property "read_only"',
      );
    }
    const detect = harnessesTools.find((candidate) => candidate.name === "harnesses_detect");
    if (!detect) throw new TypeError("Missing harnesses_detect");
    expect(validateInput(detect, { _: "" }).ok).toBe(true);
  });

  it("registers the MCP definitions unchanged in both hosts", () => {
    for (const definition of harnessesTools) {
      const fromPi = tool(piTools, definition.name);
      const fromOmp = tool(ompTools, definition.name);
      for (const registered of [fromPi, fromOmp]) {
        expect(registered.description).toBe(definition.description);
        expect(registered.label).toBe(definition.title);
        expect(registered.parameters).toEqual(definition.input);
      }
      expect(fromPi.promptSnippet).toBe(definition.snippet);
      expect(fromPi.promptGuidelines).toEqual(definition.guidelines);
    }
  });

  it("keeps OMP approvals and the main tool list", () => {
    for (const [name, approval] of Object.entries(HARNESS_TOOL_APPROVALS)) {
      const registered = tool(ompTools, name);
      expect(registered.approval).toBe(approval);
      expect(registered.loadMode).toBe("essential");
    }
  });

  it("renders bounded terminal-safe call rows in both hosts", () => {
    const piLine = renderCall(tool(piTools, "harnesses_run"), false);
    const ompLine = renderCall(tool(ompTools, "harnesses_run"), true);

    for (const line of [piLine, ompLine]) {
      const content = line.trimEnd();
      expect(content).toContain("Harnesses Run pi");
      expect(content).not.toContain("\u001B");
      expect(content).not.toContain("https://example.com");
      expect(content.length).toBeLessThan(120);
    }
  });

  it("sanitizes result metadata in both hosts", () => {
    const piLine = renderResult(tool(piTools, "harnesses_info"), false);
    const ompLine = renderResult(tool(ompTools, "harnesses_info"), true);

    expect(piLine.trimEnd()).toBe("✓ (read) pi · Pi Agent");
    expect(ompLine.trimEnd()).toBe(piLine.trimEnd());
  });
});
