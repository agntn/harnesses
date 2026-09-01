import { Type as OmpType } from "@oh-my-pi/omptype/typebox";
import { describe, expect, it, vi } from "vitest";

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

import ompExtension from "../packages/omp/extensions/harnesses.ts";
import piExtension from "../packages/pi/extensions/harnesses.ts";
import { HARNESS_TOOL_LABELS } from "../packages/shared/tui.ts";

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function registeredTools(
  extension: typeof piExtension | typeof ompExtension,
  omp = false,
): unknown[] {
  const tools: unknown[] = [];
  const api = {
    registerTool(tool: unknown) {
      tools.push(tool);
    },
    ...(omp ? { setLabel() {}, typebox: { Type: OmpType } } : {}),
  };
  Reflect.apply(extension, undefined, [api]);
  return tools;
}

function tool(tools: readonly unknown[], name: string): Record<string, unknown> {
  const found = tools.find((candidate) => isRecord(candidate) && candidate.name === name);
  if (!isRecord(found)) throw new Error(`Tool not registered: ${name}`);
  return found;
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

describe("Pi and OMP extension renderers", () => {
  const piTools = registeredTools(piExtension);
  const ompTools = registeredTools(ompExtension, true);

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
    for (const definition of [tool(piTools, "harnesses_run"), tool(ompTools, "harnesses_run")]) {
      if (typeof definition.execute !== "function") throw new Error("Missing execute");
      const result: unknown = Reflect.apply(definition.execute, definition, [
        "call",
        { id: "github-copilot", prompt: "inspect", structured: true, tools: true },
      ]);
      await expect(result).rejects.toThrow("retry with structured: false");
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
