import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("MCP executor loading", () => {
  it.each(["src/mcp.ts", "dist/mcp.mjs"])(
    "%s defers executors until a valid tool call",
    (entry) => {
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          String.raw`
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const loaded = [];
registerHooks({ load(url, context, nextLoad) {
  loaded.push(url);
  return nextLoad(url, context);
}});
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { createMcpServer } = await import(${JSON.stringify(`../${entry}`)});
const client = new Client({ name: 'loading-test', version: '1.0.0' });
const server = createMcpServer();
const [a, b] = InMemoryTransport.createLinkedPair();
try {
  await Promise.all([client.connect(a), server.connect(b)]);
  assert.equal((await client.listTools()).tools.length, 10);
  assert.equal((await client.callTool({ name: 'missing' })).isError, true);
  assert.equal((await client.callTool({ name: 'harnesses_info', arguments: { id: 42 } })).isError, true);
  assert.equal(loaded.some(url => /\/(tool-operations|prompt-sync|mcp-servers)\.[tm]/.test(url)), false);
  assert.equal(loaded.some(url => url.includes('/node_modules/yaml/')), false);
  const response = await client.callTool({ name: 'harnesses_info', arguments: { id: 'pi' } });
  assert.notEqual(response.isError, true);
  assert.match(response.content[0].text, /Pi/);
  assert.equal(loaded.some(url => /\/tool-operations\.[tm]/.test(url)), true);
} finally {
  await Promise.all([client.close(), server.close()]);
}
`,
        ],
        { cwd: resolve(root, "test"), encoding: "utf8", timeout: 20_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    },
  );
});
