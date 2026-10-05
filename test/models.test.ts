import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { getHarness, registerHarness } from "../src/index.ts";
import Antigravity, { parseAntigravityModels } from "../src/harnesses/antigravity.ts";
import Codex, { parseCodexModels } from "../src/harnesses/codex.ts";
import Grok, { parseGrokModels } from "../src/harnesses/grok.ts";
import Omp, { parseOmpModels } from "../src/harnesses/omp.ts";
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

/** Verbatim `omp models --json --kind chat` entries from omp 18.4.10. */
const OMP_MODELS_OUTPUT = `{"models":[
{"provider":"openai-codex","kind":"chat","id":"gpt-5.5","selector":"openai-codex/gpt-5.5","name":"GPT-5.5","contextWindow":272000,"maxTokens":128000,"reasoning":true,"thinking":["low","medium","high","xhigh"],"input":["text","image"],"cost":{"input":5,"output":30,"cacheRead":0.5,"cacheWrite":0},"pricingStatus":"fixed"},
{"provider":"xai-oauth","kind":"chat","id":"grok-build","selector":"xai-oauth/grok-build","name":"Grok Build","contextWindow":512000,"maxTokens":512000,"reasoning":true,"thinking":null,"input":["text","image"],"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0},"pricingStatus":"unknown"},
{"provider":"opencode-go","kind":"chat","id":"omen-alpha","selector":"opencode-go/omen-alpha","name":"omen-alpha","contextWindow":null,"maxTokens":null,"reasoning":false,"thinking":null,"input":["text"],"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0},"pricingStatus":"unknown"}
]}
`;

/** `codex debug models` from codex-cli 0.160.0, cut to the fields the parser reads. */
const CODEX_MODELS_OUTPUT = `{"models":[
{"slug":"gpt-5.5","display_name":"GPT-5.5","visibility":"list","supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"},{"effort":"high"},{"effort":"xhigh"}],"context_window":272000,"input_modalities":["text","image"]},
{"slug":"codex-auto-review","display_name":"Codex Auto Review","visibility":"hide","supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"},{"effort":"high"},{"effort":"xhigh"},{"effort":"max"}],"context_window":272000,"input_modalities":["text","image"]},
{"slug":"gpt-daybreak-blue-latest","display_name":"Daybreak Blue","visibility":"list","supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"},{"effort":"high"},{"effort":"xhigh"},{"effort":"max"},{"effort":"ultra"}],"context_window":272000,"input_modalities":["text","image"]}
]}
`;

class FakeCodex extends Codex {
  override readonly binaries = ["node"];
  override readonly modelListing: Codex["modelListing"] = {
    args: ["-e", `process.stdout.write(${JSON.stringify(CODEX_MODELS_OUTPUT)})`],
    level: "inferred",
  };
}

class FakeOmp extends Omp {
  override readonly binaries = ["node"];
  override readonly modelListing: Omp["modelListing"] = {
    args: ["-e", `process.stdout.write(${JSON.stringify(OMP_MODELS_OUTPUT)})`],
    level: "inferred",
  };
}

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
    registerHarness(FakeOmp);
    registerHarness(FakeCodex);
  });

  afterAll(() => {
    registerHarness(Pi);
    registerHarness(Grok);
    registerHarness(Antigravity);
    registerHarness(Omp);
    registerHarness(Codex);
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

  it("keeps successful listing stderr out of content sent to the model", async () => {
    const result = await listHarnessModels("antigravity");

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ stderr: "Fetching available models...\n" });
    expect(result.content[0]?.text).toContain("gemini-3.1-pro-low");
    expect(result.content[0]?.text).not.toMatch(/^stderr/m);
  });

  it("shows failed listing stderr as plain text", async () => {
    registerHarness(
      class extends FakeGrok {
        override readonly modelListing: Grok["modelListing"] = {
          args: [
            "-e",
            `process.stderr.write("\\u001B[31mERROR\\u001B[0m not logged in\\n"); process.exit(2)`,
          ],
          level: "inferred",
        };
      },
    );

    try {
      const result = await listHarnessModels("grok");
      const content = result.content[0]?.text ?? "";

      expect(result.isError).toBe(true);
      expect(result.details).toMatchObject({
        exitCode: 2,
        stderr: "\u001B[31mERROR\u001B[0m not logged in\n",
      });
      expect(content).toContain("stderr:\nERROR not logged in");
      expect(content).not.toContain("\u001B");
      expect(content).not.toContain('stderr: "');
    } finally {
      registerHarness(FakeGrok);
    }
  });

  it("lists Antigravity models past the stderr progress line and filters them locally", async () => {
    const antigravity = getHarness("antigravity");

    expect((await antigravity.listModels()).models).toHaveLength(4);
    expect((await antigravity.listModels({ search: "CLAUDE" })).models).toEqual([
      { provider: "google", id: "claude-opus-4-6-thinking" },
    ]);
  });

  it("exposes the OMP chat model listing and passes the search after --", () => {
    const omp = new Omp();

    expect(omp.buildModelListInvocation()).toEqual({
      command: "omp",
      args: ["models", "--json", "--kind", "chat", "--no-extensions"],
    });
    expect(omp.buildModelListInvocation("--config=evil.yml")).toEqual({
      command: "omp",
      args: [
        "models",
        "find",
        "--json",
        "--kind",
        "chat",
        "--no-extensions",
        "--",
        "--config=evil.yml",
      ],
    });
  });

  it("parses the OMP model list and leaves out limits it does not print", () => {
    expect(parseOmpModels(OMP_MODELS_OUTPUT)).toEqual([
      {
        provider: "openai-codex",
        id: "gpt-5.5",
        contextWindow: 272_000,
        maxOutputTokens: 128_000,
        thinking: true,
        images: true,
      },
      {
        provider: "xai-oauth",
        id: "grok-build",
        contextWindow: 512_000,
        maxOutputTokens: 512_000,
        thinking: true,
        images: true,
      },
      { provider: "opencode-go", id: "omen-alpha", thinking: false, images: false },
    ]);
    expect(parseOmpModels('{"models":[]}\n')).toEqual([]);
  });

  it("rejects OMP output it does not recognize", () => {
    expect(() => parseOmpModels("Failed to load extension\n")).toThrow(
      "Unexpected OMP model-list output",
    );
    expect(() => parseOmpModels('{"models":{}}')).toThrow("Unexpected OMP model-list output");
    expect(() => parseOmpModels('{"models":[{"id":"gpt-5.5"}]}')).toThrow(
      "Unexpected OMP model-list entry",
    );
  });

  it("lists OMP models through the shared tool operation", async () => {
    const result = await listHarnessModels("omp");

    expect(result.isError).toBeUndefined();
    expect("models" in result.details ? result.details.models : []).toHaveLength(3);
    expect(result.content[0]?.text).toContain("openai-codex/gpt-5.5");
  });

  it("exposes the Codex catalog dump and filters it locally", () => {
    const codex = new Codex();

    expect(codex.buildModelListInvocation()).toEqual({
      command: "codex",
      args: ["debug", "models"],
    });
    expect(codex.buildModelListInvocation("--bundled")).toEqual({
      command: "codex",
      args: ["debug", "models"],
    });
  });

  it("parses the Codex catalog and leaves out the models Codex hides", () => {
    expect(parseCodexModels(CODEX_MODELS_OUTPUT)).toEqual([
      {
        provider: "openai",
        id: "gpt-5.5",
        name: "GPT-5.5",
        contextWindow: 272_000,
        thinking: true,
        images: true,
      },
      {
        provider: "openai",
        id: "gpt-daybreak-blue-latest",
        name: "Daybreak Blue",
        contextWindow: 272_000,
        thinking: true,
        images: true,
      },
    ]);
    expect(
      parseCodexModels(
        '{"models":[{"slug":"tiny","visibility":"list","supported_reasoning_levels":[],"input_modalities":["text"]}]}',
      ),
    ).toEqual([{ provider: "openai", id: "tiny", thinking: false, images: false }]);
    expect(parseCodexModels('{"models":[{"slug":"internal","visibility":"none"}]}')).toEqual([]);
  });

  it("rejects Codex output it does not recognize", () => {
    expect(() => parseCodexModels("Error: not logged in\n")).toThrow(
      "Unexpected Codex model-list output",
    );
    expect(() => parseCodexModels('{"models":{}}')).toThrow("Unexpected Codex model-list output");
    expect(() => parseCodexModels('{"models":[{"display_name":"GPT-5.5"}]}')).toThrow(
      "Unexpected Codex model-list entry",
    );
  });

  it("selects a Codex model by its bare slug", () => {
    expect(new Codex().modelSelector({ provider: "openai", id: "gpt-5.5" })).toBe("gpt-5.5");
  });

  it("lists Codex models through the shared tool operation, searching ids locally", async () => {
    const result = await listHarnessModels("codex", { search: "DAYBREAK" });

    expect(result.isError).toBeUndefined();
    expect("models" in result.details ? result.details.models : []).toEqual([
      expect.objectContaining({ id: "gpt-daybreak-blue-latest" }),
    ]);
  });
});
