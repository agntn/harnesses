import { Client } from "../client.ts";

export default class MastraCode extends Client {
  readonly id = "mastracode";
  readonly name = "Mastra Code";
  readonly binaries = ["mastracode"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Client["config"] = [
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
  ];
  readonly sessions: Client["sessions"] = [
    {
      path: "~/.local/share/mastracode/mastra.db",
      scope: "data",
      level: "official",
      platforms: ["linux"],
      note: "LibSQL database with threads, messages, and observational memory.",
    },
  ];
  readonly persistence: Client["persistence"] = [
    { format: "JSON", level: "official", note: "MCP and hooks config files." },
    {
      format: "SQLite",
      level: "official",
      note: "LibSQL database for threads, messages, and observational memory.",
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
  ];
  readonly skills: Client["skills"] = [
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
  ];
  readonly commands: Client["commands"] = [
    { path: ".mastracode/commands/", scope: "project", level: "official" },
    {
      path: "~/.mastracode/commands/",
      scope: "user",
      level: "official",
      note: "Global commands.",
    },
  ];
  readonly hooks: Client["hooks"] = [
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
  ];
  readonly detection = {
    envVars: [],
    projectMarkers: [".mastracode"],
  };
}
