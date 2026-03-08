import { describe, it, expect } from "vitest";
import { version } from "../src/index";

describe("aixa", () => {
  it("should export version", () => {
    expect(version).toBeDefined();
  });
});
