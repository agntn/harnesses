import { defineClient } from "../registry.ts";

export default defineClient({
  id: "mastracode",
  name: "Mastra Code",
  binaries: ["mastracode"],
  capabilities: {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  },
  config: [
    {
      path: ".mastracode/mcp.json",
      scope: "project",
      level: "official",
      note: "Project-scoped MCP server configurations.",
    },
    {
      path: "~/.mastracode/mcp.json",
      scope: "user",
      level: "official",
      note: "Global MCP server configurations.",
    },
    {
      path: ".mastracode/hooks.json",
      scope: "project",
      level: "official",
      note: "Project-scoped hooks.",
    },
    {
      path: "~/.mastracode/hooks.json",
      scope: "user",
      level: "official",
      note: "Global hooks.",
    },
  ],
  sessions: [
    {
      path: "~/.local/share/mastracode/mastra.db",
      scope: "data",
      level: "official",
      platforms: ["linux"],
      note: "LibSQL database with threads, messages, and observational memory.",
    },
  ],
  persistence: [
    { format: "JSON", level: "official", note: "MCP and hooks config files." },
    {
      format: "SQLite",
      level: "official",
      note: "LibSQL database for threads, messages, and observational memory.",
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
      path: ".claude/CLAUDE.md",
      scope: "project",
      level: "official",
      note: "Claude Code compatible.",
    },
    {
      path: ".mastracode/AGENTS.md",
      scope: "project",
      level: "official",
      note: "Alternative project-level location.",
    },
    {
      path: "~/.claude/CLAUDE.md",
      scope: "user",
      level: "official",
      note: "Claude Code compatible.",
    },
    {
      path: "~/.mastracode/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ],
  skills: [
    { path: ".mastracode/skills/", scope: "project", level: "official" },
    {
      path: "~/.mastracode/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Claude Code compatible.",
    },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Claude Code compatible.",
    },
  ],
  commands: [
    { path: ".mastracode/commands/", scope: "project", level: "official" },
    {
      path: "~/.mastracode/commands/",
      scope: "user",
      level: "official",
      note: "Global commands.",
    },
  ],
  hooks: [
    {
      path: ".mastracode/hooks.json",
      scope: "project",
      level: "official",
    },
    {
      path: "~/.mastracode/hooks.json",
      scope: "user",
      level: "official",
      note: "Global hooks.",
    },
  ],
  detection: {
    envVars: [],
    projectMarkers: [".mastracode"],
  },
});
