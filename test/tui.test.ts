import { describe, expect, it } from "vitest";
import { renderToolCall, renderToolResult, sanitizeTerminalText } from "../packages/shared/tui.ts";

const plainTheme = {};

describe("shared extension TUI", () => {
  it("sanitizes external values before terminal rendering", () => {
    const escape = String.fromCodePoint(0x1b);
    const bell = String.fromCodePoint(0x07);
    const c1 = String.fromCodePoint(0x85);
    const lineSeparator = String.fromCodePoint(0x2028);
    const paragraphSeparator = String.fromCodePoint(0x2029);
    const bidiOverride = String.fromCodePoint(0x202e);
    const text = sanitizeTerminalText(
      `${escape}]8;;https://example.com${bell}open${escape}]8;;${bell} a${c1}b c${lineSeparator}d e${paragraphSeparator}f g${bidiOverride}h`,
    );

    expect(text).toBe("open a b c d e f g h");
    for (const control of [escape, bell, c1, lineSeparator, paragraphSeparator, bidiOverride]) {
      expect(text).not.toContain(control);
    }
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

  it("keeps expanded single-line output up to the body limit", () => {
    const marker = "TAIL-MARKER";
    const expanded = renderToolResult(
      "harnesses_info",
      {
        content: [{ type: "text", text: `${"x".repeat(3000)}${marker}` }],
        details: { id: "pi", name: "Pi" },
      },
      false,
      { expanded: true },
      plainTheme,
    );

    expect(expanded).toContain(marker);
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
