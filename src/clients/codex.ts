import { Client } from "../client.ts";

export default class Codex extends Client {
  readonly id = "codex";
  readonly name = "OpenAI Codex CLI";
  readonly binaries = ["codex"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Client["config"] = [
    { path: "~/.codex/config.toml", scope: "user", level: "official" },
    {
      path: ".codex/config.toml",
      scope: "project",
      level: "official",
      note: "Searched from cwd up to project root (.git boundary).",
    },
    {
      path: "/etc/codex/config.toml",
      scope: "system",
      level: "official",
      platforms: ["linux", "darwin"],
    },
  ];
  readonly sessions: Client["sessions"] = [
    {
      path: "~/.codex/sessions/",
      scope: "data",
      level: "official",
      note: "Session rollouts in JSONL format, organized by date.",
    },
    {
      path: "~/.codex/history.jsonl",
      scope: "data",
      level: "official",
      note: "Command history.",
    },
    {
      path: "~/.codex/state_5.sqlite",
      scope: "data",
      level: "official",
      note: "SQLite state database for threads and agent state.",
    },
  ];
  readonly persistence: Client["persistence"] = [
    { format: "TOML", level: "official", note: "Configuration files." },
    { format: "JSONL", level: "official", note: "Conversation transcripts." },
    { format: "SQLite", level: "official", note: "Thread and agent state." },
  ];
  readonly instructions: Client["instructions"] = [
    { path: "AGENTS.md", scope: "project", level: "official" },
    {
      path: "AGENTS.override.md",
      scope: "project",
      level: "official",
      note: "Local override, takes precedence over AGENTS.md.",
    },
    {
      path: "~/.codex/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
    {
      path: "~/.codex/AGENTS.override.md",
      scope: "user",
      level: "official",
      note: "Global override, takes precedence over global AGENTS.md.",
    },
  ];
  readonly skills: Client["skills"] = [
    { path: ".codex/skills/", scope: "project", level: "official" },
    { path: ".agents/skills/", scope: "project", level: "official" },
    {
      path: "~/.codex/skills/",
      scope: "user",
      level: "official",
      note: "Deprecated, use ~/.agents/skills/ instead.",
    },
    { path: "~/.agents/skills/", scope: "user", level: "official" },
    {
      path: "/etc/codex/skills/",
      scope: "system",
      level: "official",
      platforms: ["linux", "darwin"],
    },
  ];
  readonly commands: Client["commands"] = [];
  readonly hooks: Client["hooks"] = [];
  readonly detection = {
    envVars: [],
    projectMarkers: [".codex", "AGENTS.md", "AGENTS.override.md", ".agents/skills"],
  };
}
