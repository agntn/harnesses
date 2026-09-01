import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp.ts";
import { listHarnesses } from "../src/index.ts";

const openConnections: Array<{ close(): Promise<void> }> = [];

async function connectTestClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: "harnesses-test", version: "1.0.0" });
  openConnections.push(client, server);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

type TextContent = Readonly<{ type: "text"; text: string }>;

function isTextContent(value: unknown): value is TextContent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function onlyTextContent(content: unknown): string {
  if (!Array.isArray(content) || content.length !== 1) {
    throw new TypeError("Expected exactly one MCP content block");
  }
  const [part] = content as unknown[];
  if (!isTextContent(part)) throw new TypeError("Expected an MCP text content block");
  if (Object.keys(part).sort().join(",") !== "text,type") {
    throw new TypeError("Expected only MCP text content fields");
  }
  return part.text;
}

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((connection) => connection.close()));
});

describe("harnesses MCP server", () => {
  it("distinguishes metadata reads, executable reads, and mutations", async () => {
    const client = await connectTestClient();

    const response = await client.listTools();

    expect(response.tools.map((tool) => tool.name)).toEqual([
      "harnesses_detect",
      "harnesses_info",
      "harnesses_models",
      "harnesses_run",
      "harnesses_mcp_list",
      "harnesses_mcp_add",
      "harnesses_mcp_sync",
      "harnesses_agents_sync",
      "harnesses_mcp_remove",
    ]);
    const runTool = response.tools.find((tool) => tool.name === "harnesses_run");
    expect(runTool?.inputSchema.required).toContain("tools");
    expect(runTool?.inputSchema.properties).toHaveProperty("readOnly");

    const readOnlyTools = new Set(["harnesses_detect", "harnesses_info", "harnesses_mcp_list"]);
    for (const tool of response.tools) {
      const readOnly = readOnlyTools.has(tool.name);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: readOnly,
        destructiveHint: tool.name === "harnesses_models" ? false : !readOnly,
        openWorldHint: tool.name === "harnesses_run" || tool.name === "harnesses_models",
      });
    }
  });

  it("returns full metadata for a known harness id", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: { id: "claude" },
    });

    expect(response.isError).not.toBe(true);
    const [part] = response.content as Array<{ text: string }>;
    expect(part?.text).toContain("Anthropic Claude Code");
    expect(part?.text).toContain(".claude/skills/");
    expect(part?.text).toContain("invocationModes");
    expect(part?.text).toContain("advisor: true");
    expect(part?.text).toContain("resolved");
  });

  it("returns metadata batches in input order", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: { id: ["codex", "claude"] },
    });

    expect(response.isError).not.toBe(true);
    const [part] = response.content as Array<{ text: string }>;
    const codexIndex = part?.text.indexOf("OpenAI Codex CLI") ?? -1;
    const claudeIndex = part?.text.indexOf("Anthropic Claude Code") ?? -1;
    expect(codexIndex).toBeGreaterThanOrEqual(0);
    expect(claudeIndex).toBeGreaterThan(codexIndex);
  });

  it("flags an unknown harness id and lists the known ones", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: { id: "nope" },
    });

    expect(response.isError).toBe(true);
    const [part] = response.content as Array<{ text: string }>;
    expect(part?.text).toContain("Unknown harness: nope");
    for (const id of listHarnesses()) {
      expect(part?.text).toContain(id);
    }
  });

  it("returns executable retry guidance for unsupported run modes", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_run",
      arguments: { id: "github-copilot", prompt: "inspect", structured: true, tools: false },
    });

    expect(response.isError).toBe(true);
    const content = onlyTextContent(response.content);
    expect(content).toContain("structured: false");
    expect(content).toContain("tools: true");
  });

  it("rejects empty metadata batches", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: { id: [] },
    });

    expect(response.isError).toBe(true);
    expect(onlyTextContent(response.content)).toContain("Invalid arguments at /id");
  });

  it("rejects an id the pattern forbids", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: { id: "Nope!" },
    });

    expect(response.isError).toBe(true);
    expect(onlyTextContent(response.content)).toContain("Invalid arguments at /id");
  });

  it("rejects arguments that miss the schema", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: {},
    });

    expect(response.isError).toBe(true);
    expect(onlyTextContent(response.content)).toContain("Invalid arguments");
  });
});
