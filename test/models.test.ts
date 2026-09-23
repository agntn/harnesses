import { beforeAll, describe, expect, it } from "vitest";
import { getHarness, registerHarness } from "../src/index.ts";
import Antigravity, { parseAntigravityModels } from "../src/harnesses/antigravity.ts";
import Grok, { parseGrokModels } from "../src/harnesses/grok.ts";
import Pi, { parsePiModelTable } from "../src/harnesses/pi.ts";
import PrimeAgent from "../src/harnesses/prime-agent.ts";
import { listHarnessModels, runHarness } from "../src/tool-operations.ts";

const MODELS_OUTPUT = `provider      model                context  max-out  thinking  images
openai-codex  gpt-5.4              272K     128K     yes       yes
xai           grok-4.3             1M       30K      yes       no
`;

// Verbatim `grok models` output from grok 1.0.41.
const GROK_MODELS_OUTPUT = `You are logged in with grok.com.

Default model: grok-4.7

Available models:
  * grok-4.7 (default)
  - grok-4.7-build-fast
  - grok-4.6
  - grok-4.5
`;

// Verbatim `agy models` stdout from agy 1.2.5, trimmed to four rows.
const AGY_MODELS_OUTPUT = [
  "gemini-3.8-flash-high\tGemini 3.8 Flash (High)",
  "gemini-3.1-pro-low\tGemini 3.1 Pro (Low)",
  "claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)",
  "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)",
  "",
].join("\n");

class FakeAntigravity extends Antigravity {
  override readonly binaries = ["node"];
  override readonly modelListing: Antigravity["modelListing"] = {
    args: [
      "-e",
      `process.stderr.write("Fetching available models...\\n");
       process.stdout.write(${JSON.stringify(AGY_MODELS_OUTPUT)})`,
    ],
    level: "inferred",
  };
}

class FakeGrok extends Grok {
  override readonly binaries = ["node"];
  override readonly modelListing: Grok["modelListing"] = {
    args: ["-e", `process.stdout.write(${JSON.stringify(GROK_MODELS_OUTPUT)})`],
    level: "inferred",
  };
}

class FakePi extends Pi {
  override readonly binaries = ["node"];
  override readonly invocation: Pi["invocation"] = {
    args: ["-e", "console.log(process.argv.slice(1).join('|'))", "{prompt}"],
    noToolsArgs: ["-e", "console.log(process.argv.slice(1).join('|'))", "{prompt}"],
    modelArgs: ["{model}"],
    level: "inferred",
  };
  override readonly modelListing: Pi["modelListing"] = {
    args: ["-e", `process.stdout.write(${JSON.stringify(MODELS_OUTPUT)})`],
    searchArgs: [
      "-e",
      `process.argv[1] === "missing"
        ? console.log('No models matching "missing"')
        : process.stdout.write(${JSON.stringify(MODELS_OUTPUT)})`,
      "{search}",
    ],
    level: "inferred",
  };
}

describe("model listing", () => {
  beforeAll(() => {
    registerHarness(FakePi);
    registerHarness(FakeGrok);
    registerHarness(FakeAntigravity);
  });

  it("exposes the Pi model-listing command", () => {
    const pi = new Pi();

    expect(pi.buildModelListInvocation()).toEqual({ command: "pi", args: ["--list-models"] });
    expect(pi.buildModelListInvocation("gpt-5.4")).toEqual({
      command: "pi",
      args: ["--list-models", "gpt-5.4"],
    });
  });

  it("exposes the Prime Agent model-listing command", () => {
    const primeAgent = new PrimeAgent();

    expect(primeAgent.buildModelListInvocation()).toEqual({
      command: "prime-agent",
      args: ["model", "list"],
    });
    expect(primeAgent.buildModelListInvocation("gpt-5.4")).toEqual({
      command: "prime-agent",
      args: ["model", "list", "gpt-5.4"],
    });
  });

  it("names the harness in shared model table errors", () => {
    expect(() => parsePiModelTable("", "Prime Agent")).toThrow(
      "Unexpected empty Prime Agent model-list output",
    );
    expect(() => parsePiModelTable("provider  model\n", "Prime Agent")).toThrow(
      "Unexpected Prime Agent model-list header",
    );
    expect(parsePiModelTable('No models matching "missing"\n', "Prime Agent")).toEqual([]);
  });

  it("preserves replacement tokens in model names", () => {
    const model = "custom/$$-$&-$`-$'-$1-{model}";

    expect(new Pi().buildInvocation("answer this", { model })).toEqual({
      command: "pi",
      args: ["-p", "--no-tools", "answer this", "--model", model],
    });
  });

  it("preserves replacement tokens in model search filters", () => {
    const search = "$$ $& $` $' $1 {search}";

    expect(new Pi().buildModelListInvocation(search)).toEqual({
      command: "pi",
      args: ["--list-models", search],
    });
  });

  it("adds an explicit model to a Pi run invocation", () => {
    const pi = new Pi();

    expect(pi.buildInvocation("answer this", { model: "openai-codex/gpt-5.4" })).toEqual({
      command: "pi",
      args: ["-p", "--no-tools", "answer this", "--model", "openai-codex/gpt-5.4"],
    });
  });

  it("passes the selected model through the shared run operation", async () => {
    const result = await runHarness("pi", "ping", { model: "test-model" });

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ model: "test-model", stdout: "ping|test-model\n" });
  });

  it("returns normalized models from the Pi table", async () => {
    const result = await getHarness("pi").listModels();

    expect(result.exitCode).toBe(0);
    expect(result.models).toEqual([
      {
        provider: "openai-codex",
        id: "gpt-5.4",
        contextWindow: 272_000,
        maxOutputTokens: 128_000,
        thinking: true,
        images: true,
      },
      {
        provider: "xai",
        id: "grok-4.3",
        contextWindow: 1_000_000,
        maxOutputTokens: 30_000,
        thinking: true,
        images: false,
      },
    ]);
  });

  it("returns an empty model list when Pi finds no match", async () => {
    const result = await getHarness("pi").listModels({ search: "missing" });

    expect(result.exitCode).toBe(0);
    expect(result.models).toEqual([]);
  });

  it("rejects an undocumented empty Pi response", async () => {
    const pi = new (class extends FakePi {
      override readonly modelListing: Pi["modelListing"] = {
        args: ["-e", ""],
        level: "inferred",
      };
    })();

    await expect(pi.listModels()).rejects.toThrow("Unexpected empty Pi model-list output");
  });

  it("exposes the Grok model-listing command without a native filter", () => {
    const grok = new Grok();

    expect(grok.buildModelListInvocation()).toEqual({ command: "grok", args: ["models"] });
    expect(grok.buildModelListInvocation("4.7")).toEqual({ command: "grok", args: ["models"] });
  });

  it("parses the Grok model list and flags the default", () => {
    expect(parseGrokModels(GROK_MODELS_OUTPUT)).toEqual([
      { provider: "xai", id: "grok-4.7", default: true },
      { provider: "xai", id: "grok-4.7-build-fast" },
      { provider: "xai", id: "grok-4.6" },
      { provider: "xai", id: "grok-4.5" },
    ]);
    expect(parseGrokModels("Available models:\n")).toEqual([]);
  });

  it("rejects Grok output it does not recognize", () => {
    expect(() => parseGrokModels("Not logged in.\n")).toThrow("Unexpected Grok model-list output");
    expect(() => parseGrokModels("Available models:\n  + grok-4.7\n")).toThrow(
      "Unexpected Grok model-list row",
    );
  });

  it("filters a listing without native search by id, ignoring case", async () => {
    const result = await getHarness("grok").listModels({ search: "GROK-4.7" });

    expect(result.args).not.toContain("GROK-4.7");
    expect(result.models.map((model) => model.id)).toEqual(["grok-4.7", "grok-4.7-build-fast"]);
    expect((await getHarness("grok").listModels({ search: "grok-5" })).models).toEqual([]);
  });

  it("returns Grok models through the shared tool operation", async () => {
    const result = await listHarnessModels("grok", { search: "4.7" });

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({
      id: "grok",
      search: "4.7",
      models: [
        { provider: "xai", id: "grok-4.7", default: true },
        { provider: "xai", id: "grok-4.7-build-fast" },
      ],
    });
  });

  it("rejects listing models for an unsupported harness", async () => {
    await expect(getHarness("mastracode").listModels()).rejects.toThrow(
      "does not support model listing",
    );
  });

  it("returns models through the shared tool operation", async () => {
    const result = await listHarnessModels("pi");

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ id: "pi" });
    expect("models" in result.details ? result.details.models : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "gpt-5.4" })]),
    );
    expect(result.content[0]?.text).toContain("gpt-5.4");
  });

  it("exposes the Antigravity model-listing command without a native filter", () => {
    const antigravity = new Antigravity();

    expect(antigravity.buildModelListInvocation()).toEqual({ command: "agy", args: ["models"] });
    expect(antigravity.buildModelListInvocation("gemini")).toEqual({
      command: "agy",
      args: ["models"],
    });
  });

  it("parses the Antigravity model list under the google provider", () => {
    expect(parseAntigravityModels(AGY_MODELS_OUTPUT)).toEqual([
      { provider: "google", id: "gemini-3.8-flash-high" },
      { provider: "google", id: "gemini-3.1-pro-low" },
      { provider: "google", id: "claude-opus-4-6-thinking" },
      { provider: "google", id: "gpt-oss-120b-medium" },
    ]);
  });

  it("rejects Antigravity output it does not recognize", () => {
    expect(() => parseAntigravityModels("")).toThrow(
      "Unexpected empty Antigravity model-list output",
    );
    expect(() => parseAntigravityModels("Fetching available models...\n")).toThrow(
      "Unexpected Antigravity model-list row",
    );
  });

  it("selects Antigravity models by bare id and Pi models by provider and id", () => {
    expect(new Antigravity().modelSelector({ provider: "google", id: "gemini-3.1-pro-low" })).toBe(
      "gemini-3.1-pro-low",
    );
    expect(new Pi().modelSelector({ provider: "openai-codex", id: "gpt-5.4" })).toBe(
      "openai-codex/gpt-5.4",
    );
  });

  it("lists Antigravity models past the stderr progress line and filters them locally", async () => {
    const antigravity = getHarness("antigravity");

    expect((await antigravity.listModels()).models).toHaveLength(4);
    expect((await antigravity.listModels({ search: "CLAUDE" })).models).toEqual([
      { provider: "google", id: "claude-opus-4-6-thinking" },
    ]);
  });
});
