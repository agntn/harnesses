import { Harness } from "../harness.ts";

export default class MastraCode extends Harness {
  readonly id = "mastracode";
  readonly name = "Mastra Code";
  readonly binaries = ["mastracode"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
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
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.local/share/mastracode/mastra.db",
      scope: "data",
      level: "official",
      platforms: ["linux"],
      note: "LibSQL database with threads, messages, and observational memory.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "MCP and hooks config files." },
    {
      format: "SQLite",
      level: "official",
      note: "LibSQL database for threads, messages, and observational memory.",
    },
  ];
  readonly instructions: Harness["instructions"] = [
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
  readonly skills: Harness["skills"] = [
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
  readonly commands: Harness["commands"] = [
    { path: ".mastracode/commands/", scope: "project", level: "official" },
    {
      path: "~/.mastracode/commands/",
      scope: "user",
      level: "official",
      note: "Global commands.",
    },
  ];
  readonly hooks: Harness["hooks"] = [
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
