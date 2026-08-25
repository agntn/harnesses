import { Harness } from "../harness.ts";

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
    level: "official",
    note: "Add --mode json for structured event output.",
  };
  readonly detection = {
    envVars: ["PI_CODING_AGENT", "PI_SESSION_ID", "PI_SESSION_FILE"],
    projectMarkers: [".pi"],
  };
}
