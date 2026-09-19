import { describe, expect, it } from "vitest";
import { getHarness } from "../src/index.ts";
import Omp from "../src/harnesses/omp.ts";
import { harnessInfo } from "../src/tool-operations.ts";

describe("prompt template locations", () => {
  it("resolves OMP prompt directories without confusing them with executable commands", () => {
    const omp = getHarness("omp");
    const paths = omp.resolve({ homeDir: "/home/fixture", platform: "linux" });

    expect(paths.promptTemplates.map((entry) => entry.path)).toEqual([
      ".omp/commands/",
      "/home/fixture/.omp/agent/commands/",
      ".omp/prompts/",
      "/home/fixture/.omp/agent/prompts/",
    ]);
    expect(paths.commands.map((entry) => entry.path)).toEqual([
      ".omp/commands/",
      "/home/fixture/.omp/agent/commands/",
    ]);
    expect(omp.promptTemplates.map((entry) => entry.path)).toContain("~/.omp/agent/prompts/");
  });

  it("applies platform filters and preserves evidence on custom template locations", () => {
    class CustomTemplates extends Omp {
      override readonly promptTemplates: Omp["promptTemplates"] = [
        {
          path: "${PROJECT_ROOT}/prompts/",
          scope: "project",
          level: "community",
          platforms: ["linux"],
          note: "Custom template directory.",
        },
        { path: "%APPDATA%/prompts/", scope: "user", level: "inferred", platforms: ["win32"] },
      ];
    }
    const harness = new CustomTemplates();
    expect(
      harness.resolve({ platform: "linux", projectRoot: "/workspace" }).promptTemplates,
    ).toEqual([
      {
        path: "/workspace/prompts/",
        scope: "project",
        level: "community",
        platforms: ["linux"],
        note: "Custom template directory.",
      },
    ]);
    expect(harness.promptTemplates[0]?.path).toBe("${PROJECT_ROOT}/prompts/");
  });

  it("exposes resolved templates in tool text and keeps raw locations in details", () => {
    const result = harnessInfo("pi");
    if ("error" in result.details) throw new Error(result.details.error);

    expect(result.details.promptTemplates.map((entry) => entry.path)).toEqual([
      ".pi/prompts/",
      "~/.pi/agent/prompts/",
    ]);
    expect(result.content[0]?.text).toContain("promptTemplates[");
    expect(result.content[0]?.text).toContain("/.pi/agent/prompts/");
    expect(result.content[0]?.text).not.toContain("~/.pi/agent/prompts/");
    expect(getHarness("github-copilot").resolve().promptTemplates).toEqual([]);
  });
});
