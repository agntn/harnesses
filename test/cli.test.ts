import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "src/cli.ts");
const hook = resolve(root, "test/record-loads.ts");

/**
 * Runs `src/cli.ts` under the load hook; citty exits the process itself, so the hook reports at exit.
 * @param args - CLI arguments after the bin name.
 * @param input - Text handed to the child's stdin before it closes.
 * @param environment - Environment entries added to the child process.
 * @returns {SpawnSyncReturns<string> & { loaded: string[] }} The spawn result plus every module URL the child loaded.
 */
function runCli(
  args: readonly string[],
  input = "",
  environment: Readonly<Record<string, string>> = {},
): SpawnSyncReturns<string> & { loaded: string[] } {
  const result = spawnSync(process.execPath, ["--import", hook, cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
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

  it("harnesses prompts sync links the canonical Markdown source", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "harnesses-cli-prompts-"));
    const homeDir = join(temporaryRoot, "home");
    const xdgDataDir = join(temporaryRoot, "data");
    const source = join(xdgDataDir, "agntn", "prompts", "review.md");
    mkdirSync(resolve(source, ".."), { recursive: true });
    writeFileSync(source, "Review $ARGUMENTS.\n");

    try {
      const result = runCli(["prompts", "sync", "pi", "--json"], "", {
        HOME: homeDir,
        USERPROFILE: homeDir,
        XDG_DATA_HOME: xdgDataDir,
      });

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        templates: ["review"],
        targets: [{ id: "pi", action: "linked", templates: [] }],
      });
      expect(readlinkSync(join(homeDir, ".pi", "agent", "prompts"))).toBe(resolve(source, ".."));
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("harnesses prompts sync formats failures as JSON", () => {
    const result = runCli(["prompts", "sync", "unknown", "--json"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: "Unknown harness: unknown" });
  });

  it("harnesses run rejects --read-only beside --no-tools", () => {
    const result = runCli(["run", "claude", "--no-tools", "--read-only", "review"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Harness claude cannot run readOnly with tools: false");
  });

  it("harnesses prompts sync sanitizes Unicode formatting in human errors", () => {
    const bidiOverride = String.fromCodePoint(0x202e);
    const result = runCli(["prompts", "sync", `bad${bidiOverride}id`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown harness: bad id");
    expect(result.stderr).not.toContain(bidiOverride);
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
