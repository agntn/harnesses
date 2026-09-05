# @agntn/harnesses

[![npm version](https://img.shields.io/npm/v/%40agntn%2Fharnesses?style=flat&colorA=130f40&colorB=474787)](https://npmjs.com/package/@agntn/harnesses)
[![npm downloads](https://img.shields.io/npm/dm/%40agntn%2Fharnesses?style=flat&colorA=130f40&colorB=474787)](https://npm.chart.dev/@agntn/harnesses)
[![license](https://img.shields.io/github/license/agntn/harnesses?style=flat&colorA=130f40&colorB=474787)](https://github.com/agntn/harnesses/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/harnesses)

Metadata toolkit for AI coding harnesses. One registry of paths, formats, and detection rules for every major CLI.

Docs: [harnesses.agntn.dev](https://harnesses.agntn.dev)

## Install

```bash
pnpm add @agntn/harnesses
```

## Usage

```ts
import { getHarness, detectHarness, detectProjectHarnesses } from "@agntn/harnesses";

const claude = getHarness("claude");
console.log(claude.skills); // [{ path: ".claude/skills/", scope: "project", ... }, ...]
console.log(claude.hooks); // [{ path: ".claude/hooks/", scope: "project", ... }, ...]
console.log(claude.invocationModes); // advisor and full agent modes, no read-only mode

const codex = getHarness("codex");
await codex.invoke("Review this patch", { readOnly: true, timeoutMs: 60_000 });

const pi = getHarness("pi");
const { models } = await pi.listModels({ search: "gpt-5.4" });
console.log(models); // [{ provider: "openai-codex", id: "gpt-5.4", ... }]
await pi.invoke("Review this patch", { model: "openai-codex/gpt-5.4", readOnly: true });

// Resolve to absolute paths for current platform
const paths = claude.resolve({ platform: "linux", homeDir: "/home/dev" });
console.log(paths.config); // [{ path: "/home/dev/.claude/settings.json", ... }, ...]

// Detect which agent is running (env vars first, then project markers)
const active = detectHarness();
if (active) {
  console.log(`Running inside ${active.name}`);
}

// Find all agents configured in a project directory
const harnesses = detectProjectHarnesses("/path/to/project");
```

Session schemas are typed per agent, so you get structure when parsing JSONL/SQLite/JSON files:

```ts
import type { ClaudeSessionEntry, CodexThread, GeminiConversationRecord } from "@agntn/harnesses";
```

## Supported agents

| Agent           | ID               | Detection     | Skills                | Hooks                    | Sessions       |
| --------------- | ---------------- | ------------- | --------------------- | ------------------------ | -------------- |
| Antigravity CLI | `antigravity`    | project       | `.agents/skills/`     | -                        | JSONL + SQLite |
| Claude Code     | `claude`         | env + project | `.claude/skills/`     | `.claude/hooks/`         | JSONL          |
| Codex CLI       | `codex`          | project       | `.agents/skills/`     | -                        | SQLite + JSONL |
| Gemini CLI      | `gemini`         | env + project | `.gemini/skills/`     | -                        | JSON           |
| Grok CLI        | `grok`           | env + project | `.grok/skills/`       | `.grok/hooks/`           | TOML + JSONL   |
| OpenCode        | `opencode`       | project       | `.opencode/skills/`   | -                        | SQLite         |
| Cursor          | `cursor`         | env + project | `.cursor/skills/`     | -                        | -              |
| GitHub Copilot  | `github-copilot` | env + project | `.github/skills/`     | -                        | -              |
| Mastra Code     | `mastracode`     | project       | `.mastracode/skills/` | `.mastracode/hooks.json` | SQLite         |
| OMP (oh-my-pi)  | `omp`            | env + project | `.omp/skills/`        | -                        | JSONL + SQLite |
| Pi Coding Agent | `pi`             | env + project | `.pi/skills/`         | -                        | JSON + JSONL   |
| Freebuff        | `freebuff`       | project       | `.agents/skills/`     | -                        | JSON + JSONL   |

### Native audio and video input

`audio` and `video` report whether the harness has a verified native route that puts that medium into model context. External conversion, MCP tools, and voice dictation that becomes text do not count. `false` means no native route was verified, not that every possible provider or extension was disproved.

| Agent           | Audio | Video | Evidence boundary                                                           |
| --------------- | :---: | :---: | --------------------------------------------------------------------------- |
| Antigravity CLI |  Yes  |  Yes  | Native attachments; documented audio formats and direct video pasting       |
| Gemini CLI      |  Yes  |  No   | The `read_file` tool supports audio; native video support is not documented |
| Claude Code     |  No   |  No   | No verified native route                                                    |
| Codex CLI       |  No   |  No   | No verified native route                                                    |
| Grok CLI        |  No   |  No   | Its ACP parser recognizes audio blocks, but the runtime rejects them        |
| OpenCode        |  No   |  No   | Its attachment documentation explicitly excludes audio and video            |
| Cursor          |  No   |  No   | Voice input is transcribed to text                                          |
| GitHub Copilot  |  No   |  No   | Voice input is transcribed locally to text                                  |
| Mastra Code     |  No   |  No   | No verified native route                                                    |
| OMP (oh-my-pi)  |  No   |  No   | No verified native route                                                    |
| Pi Coding Agent |  No   |  No   | No verified native route                                                    |
| Freebuff        |  No   |  No   | No verified native route                                                    |

Primary references: [Antigravity prompting](https://antigravity.google/docs/cli/prompting/), [Antigravity changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md), [Gemini CLI tools](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md), [Gemini CLI video request](https://github.com/google-gemini/gemini-cli/issues/27194), [OpenCode attachments](https://opencode.ai/v2/docs/attachments/), [Cursor prompting](https://cursor.com/docs/agent/prompting), and [Copilot CLI voice input](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/voice-input).

`invoke()` and `listModels()` accept `timeoutMs` and `signal?: AbortSignal`. Unset or `0` means no deadline. An already aborted signal skips spawning. Otherwise, the first cancellation or deadline starts cleanup: Linux and macOS use a dedicated process group, with `SIGTERM` followed by `SIGKILL` after 500 ms even if the root has exited. Windows uses `taskkill /T /F` immediately, with a 2 s budget for that command. Cleanup failures reject the call.

Stopped results retain captured output and set `exitCode: null`. Caller cancellation sets `aborted: true`, a deadline sets `timedOut: true`, and the first reason wins. Both flags are false on normal completion. Later aborts do nothing, and cancelled model listings return no parsed models. Pi, OMP, and MCP tools forward their host request signal, not a JSON argument supplied by the model.

```ts
const controller = new AbortController();
const pending = getHarness("pi").invoke("Review this change", {
  tools: true,
  readOnly: true,
  signal: controller.signal,
});
controller.abort();
const result = await pending;
console.log(result.aborted);
```

This is command cleanup, not a sandbox. Descendants that leave the POSIX process group, or outlive an already exited root on Windows, cannot be reliably reached by these mechanisms. Inherited output pipes do not extend the wait after cleanup. Scheduling and OS delays can exceed the stated budgets.

Each agent is a concrete subclass of the abstract `Harness` class. Custom subclasses can be added with `registerHarness`. Every harness exposes config paths, session locations, instruction files, skills dirs, hooks, commands, persistence formats, capabilities (MCP, vision, audio, video, tools, streaming), detection rules, a normalized non-interactive invocation (`harness.invoke(prompt, { model })`) where the CLI has a headless mode, native model listing (`harness.listModels()`) where the CLI supports it, and its MCP server config files (`listMcpServers`/`addMcpServer`/`removeMcpServer` normalize the dialects; writes rewrite JSON and surgically edit TOML with comments preserved). `syncMcpServers` treats `~/.config/agntn/mcp.jsonc` (JSONC, XDG-aware) as the single source of truth and resets every harness's user-scope MCP config to exactly that list; a top-level `"excludes": ["codex"]` array opts individual harnesses out of the sync (their own servers stay, master-listed names are withdrawn), and `~`/`${HOME}` in commands, args, and env values expand to absolute paths at sync time (harnesses spawn MCP servers without a shell). `syncAgentsFiles` links every harness's global instructions file (CLAUDE.md/AGENTS.md/GEMINI.md) to one master file as symlinks, so an edit made through any harness lands in the single physical copy; `~/.config/agntn/agents.jsonc` sets the `source`, `companions`, and `excludes`, diverged regular files are backed up and relinked, and check mode reports without writing. Companion paths are relative to the source directory and are linked at the same relative path beside each harness target.

```jsonc
{
  "source": "bundle/AGENTS.md",
  "companions": ["RULES.md"],
  "excludes": ["codex"],
}
```

All paths carry `scope` (user/project/system/data), `level` (official/community/inferred), and optional `platforms` tags.

The `harnesses_info` agent tool accepts one harness id or a batch of up to 20 ids. Batch results keep the input order and include errors for unknown ids beside successful metadata.

## CLI

```bash
harnesses list                  # all known harnesses
harnesses detect                # which ones are installed + versions
harnesses info claude           # metadata, including supported invocation modes
harnesses paths claude          # resolved paths for current platform
harnesses info codex --json     # machine-readable output
harnesses models pi             # models available to Pi
harnesses models pi gpt-5.4 --json
harnesses run claude "review this design"       # advisor without tools mode (default)
harnesses run pi --model openai-codex/gpt-5.4 "review this design"
harnesses run claude --tools "fix lint"         # full agent with tools enabled
harnesses run codex --read-only "review this"   # tools inside a native read-only sandbox
harnesses mcp-servers list      # MCP servers configured across all harnesses
harnesses mcp-servers add omp probe --command node --args "srv.mjs mcp"
harnesses mcp-servers remove omp probe
harnesses mcp-servers sync      # reset all harnesses to ~/.config/agntn/mcp.jsonc
harnesses agents sync --check   # doctor: link global AGENTS.md files to one master
harnesses mcp                   # run the MCP server over stdio
```

`tools` defaults to `false` in the library and CLI. The MCP, Pi, and OMP tools require agents to choose it explicitly. `false` must use a native CLI flag that removes tools from the model context; it is a lightweight advisor, not an agent constrained only by prompt wording. Set `tools: true` (or CLI `--tools`) whenever the task needs harness tools, including Grok's native X search. Add `readOnly: true` when those tools must stay inside a sandbox enforced by the harness CLI; the agent tools pass it beside `tools: true`, while the library and CLI let it imply tools. Read-only mode is rejected when a harness has no verified native recipe, so it never falls back to broader access. Harnesses whose CLI cannot disable tools reject advisor mode instead of silently running an agent and return an explicit `tools` retry when their full agent mode can handle the request.

## How harnesses compares to unagent

[unagent](https://github.com/onmax/unagent) covers similar ground but makes different tradeoffs.

**harnesses is deep and narrow.** Each harness gets verified, platform-specific paths with scope, evidence level, and platform tags. Session formats are typed per harness. Twelve harnesses, each fully mapped.

**unagent is wide and shallow.** 40+ agents detected by env vars, but each definition is just `configDir` + `rulesFile` + `skillsDir`. No platform-specific paths, no session schemas. In exchange, it ships runtime primitives harnesses doesn't touch yet: skill install/uninstall, vector stores, browser automation, sandboxes, queues, workflows.

harnesses tells you _where coding harnesses live and what format their data uses_. unagent tells you _which agent is running_ and gives you tools to _do things_ with skills. They could use each other.

## License

[MIT](./LICENSE)
