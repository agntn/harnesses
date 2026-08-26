# @agntn/harnesses

[![npm version](https://img.shields.io/npm/v/%40agntn%2Fharnesses?style=flat&colorA=130f40&colorB=474787)](https://npmjs.com/package/@agntn/harnesses)
[![npm downloads](https://img.shields.io/npm/dm/%40agntn%2Fharnesses?style=flat&colorA=130f40&colorB=474787)](https://npm.chart.dev/@agntn/harnesses)
[![license](https://img.shields.io/github/license/agntn/harnesses?style=flat&colorA=130f40&colorB=474787)](https://github.com/agntn/harnesses/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/harnesses)

Metadata toolkit for AI coding harnesses. One registry of paths, formats, and detection rules for every major CLI.

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
console.log(claude.invocationModes); // { advisor: true, advisorStructured: true, agent: true, agentStructured: true }

const pi = getHarness("pi");
const { models } = await pi.listModels({ search: "gpt-5.4" });
console.log(models); // [{ provider: "openai-codex", id: "gpt-5.4", ... }]
await pi.invoke("Review this patch", { model: "openai-codex/gpt-5.4" });

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

Each agent is a concrete subclass of the abstract `Harness` class. Custom subclasses can be added with `registerHarness`. Every harness exposes config paths, session locations, instruction files, skills dirs, hooks, commands, persistence formats, capabilities (MCP, vision, tools, streaming), detection rules, a normalized non-interactive invocation (`harness.invoke(prompt, { model })`) where the CLI has a headless mode, native model listing (`harness.listModels()`) where the CLI supports it, and its MCP server config files (`listMcpServers`/`addMcpServer`/`removeMcpServer` normalize the dialects; writes rewrite JSON and surgically edit TOML with comments preserved). `syncMcpServers` treats `~/.config/agntn/mcp.jsonc` (JSONC, XDG-aware) as the single source of truth and resets every harness's user-scope MCP config to exactly that list; a top-level `"excludes": ["codex"]` array opts individual harnesses out of the sync (their own servers stay, master-listed names are withdrawn), and `~`/`${HOME}` in commands, args, and env values expand to absolute paths at sync time (harnesses spawn MCP servers without a shell). `syncAgentsFiles` links every harness's global instructions file (CLAUDE.md/AGENTS.md/GEMINI.md) to one master file as symlinks, so an edit made through any harness lands in the single physical copy; `~/.config/agntn/agents.jsonc` sets the `source` and `excludes`, diverged regular files are backed up and relinked, and check mode reports without writing. All paths carry `scope` (user/project/system/data), `level` (official/community/inferred), and optional `platforms` tags.

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
harnesses mcp-servers list      # MCP servers configured across all harnesses
harnesses mcp-servers add omp probe --command node --args "srv.mjs mcp"
harnesses mcp-servers remove omp probe
harnesses mcp-servers sync      # reset all harnesses to ~/.config/agntn/mcp.jsonc
harnesses agents sync --check   # doctor: link global AGENTS.md files to one master
harnesses mcp                   # run the MCP server over stdio
```

`tools` defaults to `false` in the library and CLI. The MCP, Pi, and OMP tools require agents to choose it explicitly. `false` must use a native CLI flag that removes tools from the model context; it is a lightweight advisor, not an agent constrained only by prompt wording. Set `tools: true` (or CLI `--tools`) whenever the task needs harness tools, including Grok's native X search. Harnesses whose CLI cannot disable tools reject advisor mode instead of silently running an agent and return an explicit `tools` retry when their full agent mode can handle the request.

## How harnesses compares to unagent

[unagent](https://github.com/onmax/unagent) covers similar ground but makes different tradeoffs.

**harnesses is deep and narrow.** Each harness gets verified, platform-specific paths with scope, evidence level, and platform tags. Session formats are typed per harness. Twelve harnesses, each fully mapped.

**unagent is wide and shallow.** 40+ agents detected by env vars, but each definition is just `configDir` + `rulesFile` + `skillsDir`. No platform-specific paths, no session schemas. In exchange, it ships runtime primitives harnesses doesn't touch yet: skill install/uninstall, vector stores, browser automation, sandboxes, queues, workflows.

harnesses tells you _where coding harnesses live and what format their data uses_. unagent tells you _which agent is running_ and gives you tools to _do things_ with skills. They could use each other.

## License

[MIT](./LICENSE)
