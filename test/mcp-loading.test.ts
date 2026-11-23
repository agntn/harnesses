import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

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
const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
const { createMcpServer } = await import(${JSON.stringify(`../${entry}`)});
const client = new Client({ name: 'loading-test', version: '1.0.0' });
const server = createMcpServer();
const [a, b] = InMemoryTransport.createLinkedPair();
try {
  await Promise.all([client.connect(a), server.connect(b)]);
  assert.equal((await client.listTools()).tools.length, 11);
  assert.equal((await client.callTool({ name: 'missing' })).isError, true);
  assert.equal((await client.callTool({ name: 'harnesses_info', arguments: { id: 42 } })).isError, true);
  assert.equal(loaded.some(url => /\/(tool-operations|prompt-sync|skills-sync|directory-link|mcp-servers)\.[tm]/.test(url)), false);
  assert.equal(loaded.some(url => url.includes('/node_modules/yaml/')), false);
  const response = await client.callTool({ name: 'harnesses_info', arguments: { id: 'pi' } });
  assert.notEqual(response.isError, true);
  assert.match(response.content[0].text, /Pi/);
  assert.equal(loaded.some(url => /\/tool-operations\.[tm]/.test(url)), true);
  assert.equal(loaded.some(url => url.includes('/node_modules/yaml/')), false);
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

  it("drops a write cancelled while the executors still load", () => {
    const home = mkdtempSync(join(tmpdir(), "harnesses-cancel-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          String.raw`
const { harnessesTools } = await import('../src/tools.ts');
const tool = harnessesTools.find(t => t.name === 'harnesses_mcp_add');
const controller = new AbortController();
const call = tool.execute({ id: 'codex', name: 'late', command: 'x' }, { signal: controller.signal });
controller.abort(new Error('cancelled'));
await call.then(() => process.exit(3), (error) => console.log(String(error)));
`,
        ],
        {
          cwd: resolve(root, "test"),
          encoding: "utf8",
          env: { ...process.env, HOME: home, XDG_CONFIG_HOME: "" },
          timeout: 20_000,
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("cancelled");
      expect(existsSync(join(home, ".codex/config.toml"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
