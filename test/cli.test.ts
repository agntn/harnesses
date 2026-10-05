import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vite-plus/test";
import { getHarness, listHarnesses } from "../src/index.ts";

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
    expect(loadedFrom(result.loaded, "/node_modules/yaml/")).toEqual([]);
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
      expect(loadedFrom(result.loaded, "/node_modules/yaml/")).toEqual([]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("harnesses skills sync links the canonical skills directory", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "harnesses-cli-skills-"));
    const homeDir = join(temporaryRoot, "home");
    const xdgDataDir = join(temporaryRoot, "data");
    const source = join(xdgDataDir, "agntn", "skills");
    mkdirSync(join(source, "review"), { recursive: true });
    writeFileSync(join(source, "review", "SKILL.md"), "# review\n");

    try {
      const result = runCli(["skills", "sync", "pi", "--json"], "", {
        HOME: homeDir,
        USERPROFILE: homeDir,
        XDG_DATA_HOME: xdgDataDir,
      });

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        source,
        skills: ["review"],
        targets: [{ id: "pi", action: "linked" }],
      });
      expect(readlinkSync(join(homeDir, ".pi", "agent", "skills"))).toBe(source);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("harnesses prompts sync formats failures as JSON", () => {
    const result = runCli(["prompts", "sync", "unknown", "--json"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: "Unknown harness: unknown" });
  });

  it("harnesses detect --json lists the run modes harnesses run takes", () => {
    const result = runCli(["detect", "--json"], "", { PATH: "" });

    expect(result.status).toBe(0);
    const modes = listHarnesses().map((id) => {
      const harness = getHarness(id);
      return {
        id,
        installed: false,
        advisor: harness.invocationError({ tools: false }) === null,
        readOnly: harness.invocationError({ tools: true, readOnly: true }) === null,
        agent: harness.invocationError({ tools: true }) === null,
      };
    });
    expect(JSON.parse(result.stdout)).toMatchObject(modes);
  });

  it("harnesses run rejects --read-only beside --no-tools", () => {
    const result = runCli(["run", "claude", "--no-tools", "--read-only", "review"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Harness claude cannot run readOnly with tools: false");
  });

  it("harnesses models prints the ids agy --model accepts", () => {
    const binDir = mkdtempSync(join(tmpdir(), "harnesses-agy-"));
    try {
      writeFileSync(
        join(binDir, "agy"),
        [
          "#!/bin/sh",
          "echo 'Fetching available models...' >&2",
          "printf 'gemini-3.8-flash-high\\tGemini 3.8 Flash (High)\\n'",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
      // consola drops `log` under the inherited test environment, the level brings it back.
      const result = runCli(["models", "antigravity"], "", {
        CONSOLA_LEVEL: "3",
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      });

      expect(result.status).toBe(0);
      expect(stripVTControlCharacters(result.stdout)).toMatch(/\sgemini-3\.8-flash-high\s/u);
      expect(result.stdout).not.toContain("google/");
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it("harnesses models prints Codex slugs and keeps the catalog's names from steering the terminal", () => {
    const binDir = mkdtempSync(join(tmpdir(), "harnesses-codex-"));
    const catalog = JSON.stringify({
      models: [{ slug: "gpt-5.5", display_name: "GPT\u001B]0;owned\u0007-5.5\u202Eevil" }],
    });
    try {
      writeFileSync(join(binDir, "codex"), `#!/bin/sh\nprintf '%s\\n' '${catalog}'\n`, {
        mode: 0o755,
      });
      const result = runCli(["models", "codex"], "", {
        CONSOLA_LEVEL: "3",
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      });

      expect(result.status).toBe(0);
      expect(stripVTControlCharacters(result.stdout)).toMatch(/\sgpt-5\.5\s+GPT-5\.5 evil/u);
      expect(result.stdout).not.toContain("openai/");
      expect(result.stdout).not.toContain("owned");
      expect(result.stdout).not.toContain("\u202E");
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
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

  it.each(["closes stdin", "stops reading stdout"])(
    "harnesses mcp stops an in-flight run when the client %s",
    async (how) => {
      const binDir = mkdtempSync(join(tmpdir(), "harnesses-grok-"));
      const pidFile = join(binDir, "pid");
      writeFileSync(
        join(binDir, "grok"),
        [
          "#!/bin/sh",
          'if [ "$1" = --version ]; then echo 1.0.41; exit 0; fi',
          `echo $$ > '${pidFile}'`,
          "exec sleep 30",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
      const server = spawn(process.execPath, [cli, "mcp"], {
        cwd: root,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderr = "";
      server.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
      const send = (message: object) => server.stdin.write(`${JSON.stringify(message)}\n`);
      try {
        send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "harnesses-test", version: "1.0.0" },
          },
        });
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "harnesses_run", arguments: { id: "grok", prompt: "x", tools: true } },
        });
        await expect.poll(() => existsSync(pidFile), { timeout: 10_000 }).toBe(true);
        const pid = Number(readFileSync(pidFile, "utf8"));

        if (how === "closes stdin") {
          server.stdin.end();
        } else {
          // The next frame the server writes then fails with EPIPE, as when the client is gone.
          server.stdout.destroy();
          send({ jsonrpc: "2.0", id: 3, method: "ping" });
        }

        await expect.poll(() => server.exitCode, { timeout: 5000 }).toBe(0);
        await expect
          .poll(
            () => {
              try {
                process.kill(pid, 0);
                return true;
              } catch {
                return false;
              }
            },
            { timeout: 2000 },
          )
          .toBe(false);
        expect(stderr).toBe("");
      } finally {
        server.kill("SIGKILL");
        if (existsSync(pidFile)) {
          try {
            process.kill(Number(readFileSync(pidFile, "utf8")), "SIGKILL");
          } catch {
            // Already gone.
          }
        }
        rmSync(binDir, { recursive: true, force: true });
      }
    },
    15_000,
  );
});

describe("harnesses with a closed pipe", () => {
  it.each(["list", "info claude"])(
    "harnesses %s ends quietly when the reader goes away",
    async (command) => {
      // consola stays silent below warnings under a test runner, so the level is raised to make
      // the command write its listing through consola as it does in a terminal.
      const child = spawn(process.execPath, [cli, ...command.split(" ")], {
        cwd: root,
        env: { ...process.env, CONSOLA_LEVEL: "3" },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      });
      // Closing the read end before the child writes makes its first write fail with EPIPE, as
      // after `| head -1`.
      child.stdout.destroy();
      let stderr = "";
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
      await once(child, "close");

      expect(stderr).toBe("");
      expect(child.exitCode).toBe(0);
    },
  );
});
