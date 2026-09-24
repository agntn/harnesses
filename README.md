# @agntn/harnesses

[![npm version](https://npmx.dev/api/registry/badge/version/@agntn/harnesses)](https://npmx.dev/package/@agntn/harnesses)
[![npm downloads](https://npmx.dev/api/registry/badge/downloads/@agntn/harnesses)](https://npmx.dev/package/@agntn/harnesses)
[![license](https://npmx.dev/api/registry/badge/license/@agntn/harnesses)](https://npmx.dev/package/@agntn/harnesses)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/harnesses)

🧭 Thirteen coding CLIs, one map. You ask where Claude keeps skills, you get the path.

> [!WARNING]
> **@agntn/harnesses is pre-1.0.** Paths follow upstream CLIs that still move. Building on it now means pinning the version.

## Why?

Claude stores transcripts under a mangled copy of your cwd. Codex keeps TOML with comments you wanted to keep. Ask a model where Codex lives and it invents `.claude/`. So this is one registry: thirteen harnesses, same object, paths for your machine.

The rest of it sits on [harnesses.agntn.dev](https://harnesses.agntn.dev).

## ✨ Features

- 🧩 **Thirteen harnesses, one class.** Same fields on Claude, Codex, Pi and the rest.
- 📂 **Every path has a receipt.** Scope, evidence level, and a platform tag when the OS actually differs.
- 🔎 **Detects which CLI you're inside.** Environment variables first. Two project markers in one directory is `null`, not a guess.
- ▶️ **Headless runs with real modes.** Advisor without tools, full agent, or a native read-only sandbox. A mode the CLI cannot enforce is rejected.
- 🔌 **MCP across the dialects.** One master list at `~/.config/agntn/mcp.jsonc`. TOML edits keep the comments.
- 🔗 **One AGENTS.md behind the global files.** Symlinks, so an edit through Claude or Gemini is the same bytes.
- 🗂️ **One prompt folder, supported harnesses.** Markdown lives under XDG data; Gemini TOML is generated from it.
- 📜 **Session types when the format is stable.** JSONL, SQLite, JSON. Unstable shapes stay `unknown`.
- 🤖 **Eleven tools, three doors.** MCP, Pi and OMP call the same executors.

## 📦 Install

```bash
pnpm add @agntn/harnesses
```

Node.js 24 or newer.

## 🚀 First call

```bash
npx @agntn/harnesses detect
```

```
  System Scan

    ● antigravity     Google Antigravity CLI  v1.2.5
    ● claude          Anthropic Claude Code  v2.1.276
    ● codex           OpenAI Codex CLI  v0.154.0
    ○ cursor          Cursor
    ● freebuff        Freebuff
    ○ gemini          Google Gemini CLI
    ○ github-copilot  GitHub Copilot
    ● grok            xAI Grok CLI  v1.0.34
    ● mastracode      Mastra Code
    ● omp             OMP (oh-my-pi)  v18.2.4
    ● opencode        OpenCode CLI  v2.0.5
    ● prime-agent     Prime Agent  v0.9.5
    ● pi              Pi Coding Agent  v0.85.1
```

No key, no config. No network either. `detect` looks at `PATH`. Filled dot is installed, hollow is not. After `pnpm add`, the same command is `pnpm exec harnesses`, or install it once with `pnpm add -g @agntn/harnesses`.

Same binary, more commands:

```bash
harnesses list
harnesses info claude
harnesses paths pi
harnesses models pi gpt-5.4 --json
harnesses run claude "review this design"
harnesses run codex --read-only "review this"
harnesses mcp-servers list
harnesses agents sync --check
harnesses prompts sync --check
harnesses skills sync --check
```

`run` without `--tools` is the advisor. `--tools` is the full agent. `--read-only` asks the CLI for a sandbox and implies tools, so pairing it with `--no-tools` is an error. Timeouts, `--cwd` and `--model` sit in the [CLI guide](https://harnesses.agntn.dev/guide/cli).

### Commands

| Command        | What it does                                           | Example                                     |
| -------------- | ------------------------------------------------------ | ------------------------------------------- |
| `list`         | Every known harness, id and name                       | `harnesses list`                            |
| `detect`       | Which ones are installed, with versions                | `harnesses detect`                          |
| `info`         | Registry entry: modes, capabilities, path templates    | `harnesses info claude`                     |
| `paths`        | Those templates expanded for this machine              | `harnesses paths pi`                        |
| `models`       | Models the harness can use, through its native listing | `harnesses models pi`                       |
| `run`          | One prompt through headless mode                       | `harnesses run claude "review this design"` |
| `mcp-servers`  | MCP servers across the config dialects                 | `harnesses mcp-servers list`                |
| `agents sync`  | Link global instructions files to one master           | `harnesses agents sync --check`             |
| `prompts sync` | Sync one Markdown prompt directory across harnesses    | `harnesses prompts sync --check`            |
| `skills sync`  | Link every skills directory to one shared folder       | `harnesses skills sync --check`             |
| `mcp`          | The MCP server on stdio                                | `harnesses mcp`                             |

`list`, `detect`, `info`, `paths` and `models` take `--json` or `--toon`. `run --json` is different: that one is the harness's own structured output.

## 🧠 Library

```ts
import { getHarness, detectHarness } from "@agntn/harnesses";

const claude = getHarness("claude");
const paths = claude.resolve({ platform: "linux", homeDir: "/home/dev" });
console.log(paths.skills);
console.log(paths.temp, claude.envOverrides);

const active = detectHarness();
if (active) console.log(active.id);

await getHarness("codex").invoke("Review this patch", { readOnly: true });

const agy = getHarness("antigravity");
const [model] = (await agy.listModels({ search: "gemini" })).models;
if (model) await agy.invoke("Review this patch", { tools: true, model: agy.modelSelector(model) });
```

`temp` is where a harness drops its own temp files, and `envOverrides` names the variables that move its directories. `claude.resolve().temp` follows `CLAUDE_CODE_TMPDIR` when it's set, which is handy when `/tmp` is tmpfs and Claude's scratchpads are quietly eating RAM.

That's most of it, really. `getHarness` wants an exact id. `detectHarness` uses env vars first, then a single project marker. `invoke()` talks to the CLI. `listModels()` asks it what it can run, and `modelSelector()` turns one of those into what `model` takes, since Pi wants `provider/id` and Antigravity the bare id. A mode the CLI cannot run comes back as an error, not a quieter one. The rest: [Registry](https://harnesses.agntn.dev/guide/registry), [Invoke](https://harnesses.agntn.dev/guide/invoke), [MCP servers](https://harnesses.agntn.dev/guide/mcp-servers), [Instructions files](https://harnesses.agntn.dev/guide/agents-sync).

### Prompt templates

Put canonical Markdown templates in `$XDG_DATA_HOME/agntn/prompts/`, or
`~/.local/share/agntn/prompts/` when `XDG_DATA_HOME` is unset. Then sync every
supported harness:

```bash
harnesses prompts sync --check
harnesses prompts sync
```

For a Markdown harness, the whole prompt directory becomes one symlink to that
directory, so a template added through any harness shows up in all of them.
Gemini gets generated TOML commands, with `$ARGUMENTS` translated to `{{args}}`,
and its commands directory keeps nothing else. Whatever was there before is
backed up under the same XDG data tree first.

`getHarness("pi").promptTemplates` still lists every verified reusable prompt
location. `promptTemplateSyncTarget` is the single stable user destination the
sync owns for that harness. Formats, frontmatter and CLI limits are in the
[registry guide](https://harnesses.agntn.dev/guide/registry#prompt-templates).

### Skills

Skills live in `$XDG_DATA_HOME/agntn/skills/`, next to the prompts, one folder
with a `SKILL.md` per skill:

```bash
harnesses skills sync --check
harnesses skills sync
```

```ts
import { getAllHarnesses, syncSkills } from "@agntn/harnesses";

const report = syncSkills(getAllHarnesses(), true);
console.log(report.skills, report.targets);
```

Every harness's user skills directory, `~/.claude/skills/`, `~/.agents/skills/`
for Codex, `~/.pi/agent/skills/` and the rest, becomes one symlink to that
folder. A skill written through Claude is already there when Pi looks. Old
setups with a symlink per skill get replaced without ceremony, and a directory
with real skills in it is backed up to `diverged/skills/` first. Already keep
skills in a dotfiles repo? Make the XDG folder a symlink to it. The sync leaves
a harness directory alone if the source points into it, instead of moving your
only copy away. `skillsSyncTarget` names the directory it links for each
harness, `null` for Copilot and Freebuff, which have no user skills directory
in the registry.

## 🗺️ Harnesses

| ID               | Name                   | Project skills         |
| ---------------- | ---------------------- | ---------------------- |
| `antigravity`    | Google Antigravity CLI | `.agents/skills/`      |
| `claude`         | Anthropic Claude Code  | `.claude/skills/`      |
| `codex`          | OpenAI Codex CLI       | `.codex/skills/`       |
| `cursor`         | Cursor                 | `.cursor/skills/`      |
| `freebuff`       | Freebuff               | `.agents/skills/`      |
| `gemini`         | Google Gemini CLI      | `.gemini/skills/`      |
| `github-copilot` | GitHub Copilot         | `.github/skills/`      |
| `grok`           | xAI Grok CLI           | `.grok/skills/`        |
| `mastracode`     | Mastra Code            | `.mastracode/skills/`  |
| `omp`            | OMP (oh-my-pi)         | `.omp/skills/`         |
| `opencode`       | OpenCode CLI           | `.opencode/skills/`    |
| `prime-agent`    | Prime Agent            | `.prime/agent/skills/` |
| `pi`             | Pi Coding Agent        | `.pi/skills/`          |

That's the project directory. Most of them also keep a copy under your home directory, and a few read someone else's skills folder on purpose. Sessions, hooks, audio, video, the whole sheet: [Harnesses](https://harnesses.agntn.dev/harnesses).

## 🤖 Agents

```bash
harnesses mcp
pi install npm:@agntn/harnesses
omp install @agntn/harnesses
```

```json
{
  "mcpServers": {
    "harnesses": { "command": "npx", "args": ["-y", "@agntn/harnesses", "mcp"] }
  }
}
```

Eleven tools, the same eleven on MCP, Pi and OMP. `harnesses_detect`, `harnesses_info` and `harnesses_mcp_list` only read. `harnesses_run` is the one that can spend tokens. `tools` is required, so the model has to pick advisor or agent. What each call returns is on the [Agents page](https://harnesses.agntn.dev/guide/agents).

## 🚫 What this does not do

It does not install skills, drive a browser, or run a sandbox of its own. `invoke()` is the harness CLI plus process cleanup. The wide, thin agent list is [unagent](https://github.com/onmax/unagent).

## 🧩 Adding a harness

Want a fourteenth? One class extending `Harness`, then `registerHarness`. `getHarness`, the CLI and the tools pick it up. How to write that class: [Custom harnesses](https://harnesses.agntn.dev/guide/custom).

## 🛠️ Development

```bash
pnpm install
pnpm lint        # builds first, then oxlint and oxfmt --check
pnpm lint:fix
pnpm typecheck
pnpm test:run
pnpm build       # obuild
pnpm docs        # the Docus site, bundles src/ itself
```

## 💛 Thanks

Anthropic and OpenAI both run programs this package was built with. [Claude for Open Source](https://claude.com/contact-sales/claude-for-oss) and [Codex for Open Source](https://developers.openai.com/community/codex-for-oss). Thank you <3

## 📄 License

[MIT](./LICENSE)
