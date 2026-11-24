import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vite-plus/test";
import { harnessesAiTools } from "../src/ai.ts";
import { harnessesTools } from "../src/tools.ts";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/* A model that makes one tool call, then says it's done. */
function scriptedModel(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          { type: "tool-call", toolCallId: "call-0", toolName, input: JSON.stringify(input) },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text", text: "done" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });
}

/* One scripted call: the first step's parts and what the model read back. */
async function callThroughModel(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  approval?: Readonly<Record<string, "approved">>,
): Promise<{ parts: readonly { type: string }[]; reply: unknown }> {
  const model = scriptedModel(toolName, input);
  const result = await generateText({
    model,
    tools: harnessesAiTools,
    ...(approval ? { toolApproval: approval } : {}),
    stopWhen: isStepCount(2),
    prompt: "which harness is this",
  });
  const reply = (model.doGenerateCalls[1]?.prompt ?? [])
    .flatMap((message) => (message.role === "tool" ? message.content : []))
    .find((part) => part.type === "tool-result")?.output;
  return { parts: result.steps[0]?.content ?? [], reply };
}

describe("@agntn/harnesses/ai", () => {
  it("keys every tool by the name MCP, Pi and OMP use", () => {
    expect(Object.keys(harnessesAiTools)).toEqual(harnessesTools.map((tool) => tool.name));
  });

  it("lets only the three readers through without asking", () => {
    const free = Object.entries(harnessesAiTools)
      .filter(([, tool]) => tool.needsApproval !== true)
      .map(([name]) => name);
    expect(free).toEqual(["harnesses_detect", "harnesses_info", "harnesses_mcp_list"]);
  });

  it("gives the model the text the MCP server answers with", async () => {
    const info = harnessesTools.find((tool) => tool.name === "harnesses_info");
    const expected = await info?.execute({ id: "pi" }, {});
    const text = expected?.content[0]?.type === "text" ? expected.content[0].text : "";

    const { parts, reply } = await callThroughModel("harnesses_info", { id: "pi" });

    expect(text).toContain("Pi");
    expect(parts[1]).toMatchObject({ type: "tool-result", output: { text } });
    expect(reply).toEqual({ type: "text", value: text });
  });

  it("holds a run back until someone approves it", async () => {
    const { parts } = await callThroughModel("harnesses_run", {
      id: "codex",
      prompt: "x",
      tools: false,
    });
    expect(parts.map((part) => part.type)).toEqual(["tool-call", "tool-approval-request"]);
  });

  it("runs it once the caller's toolApproval says yes", async () => {
    const { parts } = await callThroughModel(
      "harnesses_run",
      { id: "codex", prompt: "x", tools: false },
      { harnesses_run: "approved" },
    );
    expect(parts.map((part) => part.type)).toEqual([
      "tool-call",
      "tool-approval-request",
      "tool-approval-response",
      "tool-error",
    ]);
    expect(String((parts[3] as { error: unknown }).error)).toMatch(/advisor/i);
  });

  it("turns an input the schema refuses into a tool error, not a throw", async () => {
    const { parts } = await callThroughModel("harnesses_info", {});
    expect(parts[1]).toMatchObject({ type: "tool-error" });
  });
});
