import { describe, expect, it } from "vitest";
import { HARNESS_INFO_MAX_ITEMS, harnessInfo } from "../src/tool-operations.ts";

describe("harness info", () => {
  it("keeps scalar results unchanged", () => {
    const result = harnessInfo("claude");

    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({ id: "claude", name: "Anthropic Claude Code" });
  });

  it("returns batch results in input order", () => {
    const result = harnessInfo(["claude", "missing", "codex"]);

    expect(result.isError).toBe(true);
    expect(result.details).toEqual([
      expect.objectContaining({ id: "claude" }),
      expect.objectContaining({ error: "Unknown harness: missing" }),
      expect.objectContaining({ id: "codex" }),
    ]);
  });

  it("rejects batch sizes outside the executor limits", () => {
    const tooMany = Array.from({ length: HARNESS_INFO_MAX_ITEMS + 1 }, () => "claude");

    for (const ids of [[], tooMany]) {
      const result = harnessInfo(ids);
      expect(result.isError).toBe(true);
      expect(result.details).toEqual({
        error: `harnesses_info accepts between 1 and ${HARNESS_INFO_MAX_ITEMS} ids`,
      });
    }
  });
});
