import { stripVTControlCharacters } from "node:util";
import { Harness } from "../harness.ts";
import type { AvailableModel } from "../types.ts";

const MODEL_HEADERS = ["provider", "model", "context", "max-out", "thinking", "images"];

function parseTokenCount(value: string): number {
  const match = /^(\d+(?:\.\d+)?)([KM])?$/.exec(value);
  if (!match?.[1]) throw new Error(`Invalid Pi token count: ${JSON.stringify(value)}`);
  const multiplier = match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return Number(match[1]) * multiplier;
}

function parseBoolean(value: string, column: string): boolean {
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new Error(`Invalid Pi ${column} value: ${JSON.stringify(value)}`);
}

export default class Pi extends Harness {
  readonly id = "pi";
  readonly name = "Pi Coding Agent";
  readonly binaries = ["pi"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.pi/agent/settings.json",
      scope: "user",
      level: "official",
      note: "Config dir overridable with PI_CODING_AGENT_DIR.",
    },
    { path: ".pi/settings.json", scope: "project", level: "official" },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.pi/agent/sessions/<dash-encoded-cwd>/<timestamp>_<session-id>.jsonl",
      scope: "data",
      level: "official",
      note: "Per-project session transcripts in JSONL format; session ids are UUIDv7. Overridable with PI_CODING_AGENT_SESSION_DIR or --session-dir.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    {
      format: "JSON",
      level: "official",
      note: "Settings, auth, trust, models, and keybindings files.",
    },
    { format: "JSONL", level: "official", note: "Session transcripts." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Loaded from parent directories and cwd; CLAUDE.md accepted as an alternative, AGENTS.override.md takes precedence over both in a directory.",
    },
    {
      path: ".pi/SYSTEM.md",
      scope: "project",
      level: "official",
      note: "Replaces the default system prompt; APPEND_SYSTEM.md appends instead.",
    },
    {
      path: "~/.pi/agent/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
    {
      path: "~/.pi/agent/SYSTEM.md",
      scope: "user",
      level: "official",
      note: "Global system prompt replacement; APPEND_SYSTEM.md appends instead.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".pi/skills/", scope: "project", level: "official" },
    {
      path: "~/.pi/agent/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
  ];
  readonly commands: Harness["commands"] = [
    {
      path: ".pi/prompts/",
      scope: "project",
      level: "official",
      note: "Prompt templates invoked as slash commands.",
    },
    {
      path: "~/.pi/agent/prompts/",
      scope: "user",
      level: "official",
      note: "Global user-level prompt templates.",
    },
  ];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "--mode", "json", "{prompt}"],
    noToolsArgs: ["-p", "--no-tools", "{prompt}"],
    noToolsJsonArgs: ["-p", "--no-tools", "--mode", "json", "{prompt}"],
    modelArgs: ["--model", "{model}"],
    level: "official",
    note: "Add --mode json for structured event output.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["--list-models"],
    searchArgs: ["--list-models", "{search}"],
    level: "official",
    note: "Lists models with configured provider authentication; accepts an optional fuzzy search.",
  };
  override readonly agentsFile = "~/.pi/agent/AGENTS.md";
  readonly detection = {
    envVars: ["PI_CODING_AGENT", "PI_SESSION_ID", "PI_SESSION_FILE"],
    projectMarkers: [".pi"],
  };

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    const lines = stripVTControlCharacters(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const first = lines[0];
    if (!first) throw new Error("Unexpected empty Pi model-list output");
    if (first.startsWith("No models available.") || first.startsWith("No models matching ")) {
      return [];
    }

    const headers = first.split(/\s{2,}/);
    if (
      headers.length !== MODEL_HEADERS.length ||
      headers.some((value, i) => value !== MODEL_HEADERS[i])
    ) {
      throw new Error(`Unexpected Pi model-list header: ${JSON.stringify(first)}`);
    }

    return lines.slice(1).map((line) => {
      const columns = line.split(/\s{2,}/);
      const [provider, id, context, maxOutput, thinking, images] = columns;
      if (
        columns.length !== MODEL_HEADERS.length ||
        !provider ||
        !id ||
        !context ||
        !maxOutput ||
        !thinking ||
        !images
      ) {
        throw new Error(`Unexpected Pi model-list row: ${JSON.stringify(line)}`);
      }
      return {
        provider,
        id,
        contextWindow: parseTokenCount(context),
        maxOutputTokens: parseTokenCount(maxOutput),
        thinking: parseBoolean(thinking, "thinking"),
        images: parseBoolean(images, "images"),
      };
    });
  }
}
