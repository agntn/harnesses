import { stripVTControlCharacters } from "node:util";
import { Harness } from "../harness.ts";
import type { AvailableModel } from "../types.ts";

/**
 * Parses `grok models`: a login line, the default model, then an
 * `Available models:` list with `*` on the default and `-` on the rest.
 *
 * @param stdout - Native model-listing output.
 * @returns {AvailableModel[]} The listed xAI models, the default one flagged.
 */
export function parseGrokModels(stdout: string): AvailableModel[] {
  const lines = stripVTControlCharacters(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.indexOf("Available models:");
  if (start === -1) throw new Error(`Unexpected Grok model-list output: ${JSON.stringify(stdout)}`);

  return lines.slice(start + 1).map((line) => {
    const match = /^([*-])\s+(\S+)(?:\s+\(default\))?$/.exec(line);
    if (!match?.[2]) throw new Error(`Unexpected Grok model-list row: ${JSON.stringify(line)}`);
    return { provider: "xai", id: match[2], ...(match[1] === "*" ? { default: true } : {}) };
  });
}

export default class Grok extends Harness {
  readonly id = "grok";
  readonly name = "xAI Grok CLI";
  readonly binaries = ["grok"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.grok/config.toml",
      scope: "user",
      level: "official",
      note: "Base directory overridable with GROK_HOME.",
    },
    {
      path: ".grok/config.toml",
      scope: "project",
      level: "official",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.grok/sessions/<encoded-cwd>/<session-id>/updates.jsonl",
      scope: "data",
      level: "official",
      note: "Authoritative ACP session update stream (conversation + tool calls); session dirs also hold chat_history.jsonl, summary.json, rewind_points.jsonl.",
    },
    {
      path: "~/.grok/sessions/<encoded-cwd>/prompt_history.jsonl",
      scope: "data",
      level: "official",
      note: "Per-project prompt history.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "TOML", level: "official", note: "Configuration files." },
    {
      format: "JSONL",
      level: "official",
      note: "Session update streams, chat history, prompt history.",
    },
    {
      format: "JSON",
      level: "official",
      note: "Session state files (summary.json, plan.json, signals.json).",
    },
    {
      format: "SQLite",
      level: "official",
      note: "Local FTS5 index over session titles and prompts for sessions search.",
    },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Also accepts Agents.md, AGENT.md, Claude.md, CLAUDE.md, CLAUDE.local.md; every matching file in a directory is loaded.",
    },
    {
      path: ".grok/rules/",
      scope: "project",
      level: "official",
      note: "*.md rules scanned at each level from repo root to cwd; .claude/rules/ and .cursor/rules/ scanned via vendor compatibility.",
    },
    {
      path: "~/.grok/rules/",
      scope: "user",
      level: "official",
      note: "Global user-level rules.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".grok/skills/", scope: "project", level: "official" },
    {
      path: "~/.grok/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.grok/skills/",
    scope: "user",
    level: "official",
  };
  readonly commands: Harness["commands"] = [
    { path: ".grok/commands/", scope: "project", level: "official" },
    {
      path: "~/.grok/commands/",
      scope: "user",
      level: "official",
      note: "Global user-level slash commands.",
    },
  ];
  readonly hooks: Harness["hooks"] = [
    { path: ".grok/hooks/", scope: "project", level: "official" },
    {
      path: "~/.grok/hooks/",
      scope: "user",
      level: "official",
      note: "JSON hook definitions (e.g. session-start.json); Claude/Cursor hook sources scanned via vendor compatibility.",
    },
  ];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "{prompt}", "--output-format", "json"],
    readOnlyArgs: ["-p", "{prompt}", "--sandbox", "read-only"],
    readOnlyJsonArgs: ["-p", "{prompt}", "--sandbox", "read-only", "--output-format", "json"],
    readOnlyMinVersion: "1.0.13",
    modelArgs: ["--model", "{model}"],
    level: "official",
    note: "-p is short for --single; add --output-format json for structured output. --sandbox read-only is kernel-enforced (Landlock, Seatbelt) regardless of the inherited permission mode and still allows writes to ~/.grok and temp dirs; verified on Linux with 1.0.13 and 1.0.25.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["models"],
    level: "official",
    note: "Prints bare ids with the default marked; verified with 1.0.41.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.grok/config.toml",
      scope: "user",
      level: "official",
      format: "toml",
      key: ["mcp_servers"],
      dialect: "standard",
      note: "grok mcp add/remove manage this file; Claude and Cursor configs are also scanned via vendor compatibility.",
    },
    {
      path: ".grok/config.toml",
      scope: "project",
      level: "official",
      format: "toml",
      key: ["mcp_servers"],
      dialect: "standard",
    },
  ];
  readonly detection = {
    envVars: ["GROK_SESSION_ID", "GROK_WORKSPACE_ROOT", "GROK_HOME"],
    projectMarkers: [".grok"],
  };

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    return parseGrokModels(stdout);
  }
}
