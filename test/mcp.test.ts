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

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((connection) => connection.close()));
});

describe("harnesses MCP server", () => {
  it("advertises both tools as read-only", async () => {
    const client = await connectTestClient();

    const response = await client.listTools();

    expect(response.tools.map((tool) => tool.name)).toEqual(["harnesses_detect", "harnesses_info"]);
    for (const tool of response.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
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
    expect(part?.text).toContain("resolved");
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

  it("rejects an id the pattern forbids", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: { id: "Nope!" },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      { type: "text", text: expect.stringContaining("Invalid arguments at /id") },
    ]);
  });

  it("rejects arguments that miss the schema", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({
      name: "harnesses_info",
      arguments: {},
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      { type: "text", text: expect.stringContaining("Invalid arguments") },
    ]);
  });
});
