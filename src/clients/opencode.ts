import { Client } from "../client.ts";

export default class OpenCode extends Client {
  readonly id = "opencode";
  readonly name = "OpenCode CLI";
  readonly binaries = ["opencode"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Client["config"] = [
    {
      path: "~/.config/opencode/opencode.jsonc",
      scope: "user",
      level: "official",
      note: "XDG-based, same path on all platforms.",
    },
    {
      path: "~/.config/opencode/opencode.json",
      scope: "user",
      level: "official",
    },
    {
      path: "opencode.jsonc",
      scope: "project",
      level: "official",
    },
    {
      path: "opencode.json",
      scope: "project",
      level: "official",
    },
    {
      path: ".opencode/opencode.jsonc",
      scope: "project",
      level: "official",
    },
    {
      path: ".opencode/opencode.json",
      scope: "project",
      level: "official",
    },
  ];
  readonly sessions: Client["sessions"] = [
    {
      path: "~/.local/share/opencode/opencode.db",
      scope: "data",
      level: "official",
      note: "SQLite database with sessions, messages, and parts. XDG-based, same path on all platforms.",
    },
  ];
  readonly persistence: Client["persistence"] = [
    { format: "JSON/JSONC", level: "official", note: "Config files." },
    {
      format: "SQLite",
      level: "official",
      note: "Session and message storage via Drizzle ORM.",
    },
  ];
  readonly instructions: Client["instructions"] = [
    { path: "AGENTS.md", scope: "project", level: "official" },
    {
      path: "CLAUDE.md",
      scope: "project",
      level: "official",
      note: "Supported for Claude Code compatibility.",
    },
    {
      path: "~/.config/opencode/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ];
  readonly skills: Client["skills"] = [
    { path: ".opencode/skills/", scope: "project", level: "official" },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Claude Code compatible.",
    },
    { path: ".agents/skills/", scope: "project", level: "official" },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Claude Code compatible.",
    },
    { path: "~/.agents/skills/", scope: "user", level: "official" },
  ];
  readonly commands: Client["commands"] = [];
  readonly hooks: Client["hooks"] = [];
  readonly detection = {
    envVars: [],
    projectMarkers: [".opencode", "opencode.jsonc", "opencode.json"],
  };
}
