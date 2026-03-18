import { defineClient } from "../registry.ts";

export default defineClient({
  id: "opencode",
  name: "OpenCode CLI",
  binaries: ["opencode"],
  capabilities: {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  },
  config: [
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
  ],
  sessions: [
    {
      path: "~/.local/share/opencode/opencode.db",
      scope: "data",
      level: "official",
      note: "SQLite database with sessions, messages, and parts. XDG-based, same path on all platforms.",
    },
  ],
  persistence: [
    { format: "JSON/JSONC", level: "official", note: "Config files." },
    {
      format: "SQLite",
      level: "official",
      note: "Session and message storage via Drizzle ORM.",
    },
  ],
  instructions: [
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
  ],
  skills: [
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
  ],
  commands: [],
  hooks: [],
  detection: {
    envVars: [],
    projectMarkers: [".opencode", "opencode.jsonc", "opencode.json"],
  },
});
