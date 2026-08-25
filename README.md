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

| Agent          | ID               | Detection     | Skills                | Hooks                    | Sessions       |
| -------------- | ---------------- | ------------- | --------------------- | ------------------------ | -------------- |
| Claude Code    | `claude`         | env + project | `.claude/skills/`     | `.claude/hooks/`         | JSONL          |
| Codex CLI      | `codex`          | project       | `.agents/skills/`     | -                        | SQLite + JSONL |
| Gemini CLI     | `gemini`         | env + project | `.gemini/skills/`     | -                        | JSON           |
| OpenCode       | `opencode`       | project       | `.opencode/skills/`   | -                        | SQLite         |
| Cursor         | `cursor`         | env + project | `.cursor/skills/`     | -                        | -              |
| GitHub Copilot | `github-copilot` | env + project | `.github/skills/`     | -                        | -              |
| Mastra Code    | `mastracode`     | project       | `.mastracode/skills/` | `.mastracode/hooks.json` | SQLite         |

Each agent is a concrete subclass of the abstract `Harness` class. Custom subclasses can be added with `registerHarness`. Every harness exposes config paths, session locations, instruction files, skills dirs, hooks, commands, persistence formats, capabilities (MCP, vision, tools, streaming), and detection rules. All paths carry `scope` (user/project/system/data), `level` (official/community/inferred), and optional `platforms` tags.

## CLI

```bash
harnesses list                  # all known harnesses
harnesses detect                # which ones are installed + versions
harnesses info claude           # full metadata for a harness
harnesses paths claude          # resolved paths for current platform
harnesses info codex --json     # machine-readable output
```

## How harnesses compares to unagent

[unagent](https://github.com/onmax/unagent) covers similar ground but makes different tradeoffs.

**harnesses is deep and narrow.** Each harness gets verified, platform-specific paths with scope, evidence level, and platform tags. Session formats are typed per harness. Seven harnesses, each fully mapped.

**unagent is wide and shallow.** 40+ agents detected by env vars, but each definition is just `configDir` + `rulesFile` + `skillsDir`. No platform-specific paths, no session schemas. In exchange, it ships runtime primitives harnesses doesn't touch yet: skill install/uninstall, vector stores, browser automation, sandboxes, queues, workflows.

harnesses tells you _where coding harnesses live and what format their data uses_. unagent tells you _which agent is running_ and gives you tools to _do things_ with skills. They could use each other.

## License

[MIT](./LICENSE)
