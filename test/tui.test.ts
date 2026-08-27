import { describe, expect, it } from "vitest";
import { renderToolCall, renderToolResult, sanitizeTerminalText } from "../packages/shared/tui.ts";

const plainTheme = {};

describe("shared extension TUI", () => {
  it("sanitizes external values before terminal rendering", () => {
    const text = sanitizeTerminalText(
      "\u001B]8;;https://example.com\u0007open\u001B]8;;\u0007\nnext\u0000",
    );

    expect(text).toBe("open next");
  });

  it("keeps a harness prompt bounded in the call row", () => {
    const line = renderToolCall(
      "harnesses_run",
      { id: "pi", prompt: "x".repeat(500) },
      { executionStarted: true },
      plainTheme,
    );

    expect(line).toContain("Harnesses Run pi");
    expect(line).toMatch(/…$/);
    expect(line.length).toBeLessThan(100);
  });

  it("summarizes detected harnesses without printing the full result", () => {
    const line = renderToolResult(
      "harnesses_detect",
      {
        details: {
          harnesses: [
            { id: "pi", installed: true },
            { id: "omp", installed: true },
            { id: "codex", installed: false },
          ],
        },
      },
      false,
      {},
      plainTheme,
    );

    expect(line).toBe("✓ (read) 2/3 installed");
  });

  it("renders failures as terminal-safe status lines", () => {
    const line = renderToolResult(
      "harnesses_info",
      { details: { error: "Unknown\u001B[31m harness\nnope" } },
      true,
      {},
      plainTheme,
    );

    expect(line).toBe("✗ (failed) Unknown harness nope");
  });

  it("shows sanitized model-facing output only when expanded", () => {
    const result = {
      content: [{ type: "text", text: "first\u001B[31m line\nsecond line" }],
      details: { id: "pi", name: "Pi" },
    };
    const collapsed = renderToolResult("harnesses_info", result, false, {}, plainTheme);
    const expanded = renderToolResult(
      "harnesses_info",
      result,
      false,
      { expanded: true },
      plainTheme,
    );

    expect(collapsed).toBe("✓ (read) pi · Pi");
    expect(expanded).toBe("✓ (read) pi · Pi\n  first line\n  second line");
  });

  it("marks no-op mutations as unsuccessful", () => {
    const line = renderToolResult(
      "harnesses_mcp_remove",
      { details: { id: "pi", action: "noop" } },
      false,
      {},
      plainTheme,
    );

    expect(line).toBe("✗ (noop)");
  });
});
