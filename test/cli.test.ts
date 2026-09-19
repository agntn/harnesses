import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "src/cli.ts");
const hook = resolve(root, "test/record-loads.ts");

/**
 * Runs `src/cli.ts` under the load hook; citty exits the process itself, so the hook reports at exit.
 * @param args - CLI arguments after the bin name.
 * @param input - Text handed to the child's stdin before it closes.
 * @returns {SpawnSyncReturns<string> & { loaded: string[] }} The spawn result plus every module URL the child loaded.
 */
function runCli(
  args: readonly string[],
  input = "",
): SpawnSyncReturns<string> & { loaded: string[] } {
  const result = spawnSync(process.execPath, ["--import", hook, cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: 20_000,
  });
  const report = /^@loaded (\[.*\])$/mu.exec(result.stderr)?.[1];
  expect(report, `the load hook reported nothing:\n${result.stderr}`).toBeDefined();
  const loaded: unknown = JSON.parse(report ?? "[]");
  expect(Array.isArray(loaded)).toBe(true);
  return { ...result, loaded: (loaded as unknown[]).map(String) };
}

/**
 * Module URLs under one package directory.
 * @param loaded - Every URL the child loaded.
 * @param directory - Path fragment that names the package directory itself, because pnpm's store paths carry peer hashes.
 * @returns {string[]} The URLs that fall under that directory.
 */
function loadedFrom(loaded: readonly string[], directory: string): string[] {
  return loaded.filter((url) => url.includes(directory));
}

describe("harnesses usage paths", () => {
  it.each([
    { args: ["--help"], status: 0 },
    { args: ["-h"], status: 0 },
    { args: ["mcp", "--help"], status: 0 },
    { args: ["no-such-command"], status: 1 },
  ])("harnesses $args prints the usage without the server", ({ args, status }) => {
    const result = runCli(args);

    expect(result.status).toBe(status);
    expect(stripVTControlCharacters(result.stdout)).toMatch(/USAGE harnesses (?:.*\|)?mcp\b/u);
    expect(result.loaded.some((url) => url.endsWith("/src/commands/mcp.ts"))).toBe(true);
    expect(loadedFrom(result.loaded, "/node_modules/@modelcontextprotocol/")).toEqual([]);
    expect(loadedFrom(result.loaded, "/node_modules/typebox/")).toEqual([]);
    expect(result.loaded.filter((url) => url.endsWith("/src/mcp.ts"))).toEqual([]);
  });

  it("harnesses mcp serves the server over stdio", () => {
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "harnesses-test", version: "1.0.0" },
      },
    };
    const result = runCli(["mcp"], `${JSON.stringify(initialize)}\n`);

    expect(result.status).toBe(0);
    const response: unknown = JSON.parse(result.stdout.trim().split("\n")[0] ?? "");
    expect(response).toMatchObject({ id: 1, result: { serverInfo: { name: "harnesses" } } });
    expect(loadedFrom(result.loaded, "/node_modules/@modelcontextprotocol/")).not.toEqual([]);
    expect(result.loaded.some((url) => url.endsWith("/src/mcp.ts"))).toBe(true);
  });
});
