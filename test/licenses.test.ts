import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = resolve(import.meta.dirname, "..");

describe("bundled licenses", () => {
  /** typebox ships inside dist/, so its MIT notice has to ride along, and obuild writes it here. */
  it("ships the typebox notice beside the bundle", () => {
    const licenses = readFileSync(resolve(root, "dist/THIRD-PARTY-LICENSES.md"), "utf8");

    expect(licenses).toMatch(/^## typebox$[\s\S]*?Copyright \(c\) .* Haydn Paterson/mu);
  });
});
