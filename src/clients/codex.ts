import { defineClient } from "../registry.ts";

export default defineClient({
  id: "codex",
  name: "OpenAI Codex CLI",
  binaries: ["codex"],
  capabilities: {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  },
  config: [
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
  ],
  sessions: [
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
  ],
  persistence: [
    { format: "TOML", level: "official", note: "Configuration files." },
    { format: "JSONL", level: "official", note: "Conversation transcripts." },
    { format: "SQLite", level: "official", note: "Thread and agent state." },
  ],
  instructions: [
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
  ],
  skills: [
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
  ],
  commands: [],
  hooks: [],
  detection: {
    envVars: [],
    projectMarkers: [".codex", "AGENTS.md", "AGENTS.override.md", ".agents/skills"],
  },
});
