import { defineClient } from "../registry.ts";

export default defineClient({
  id: "claude",
  name: "Anthropic Claude Code",
  binaries: ["claude"],
  capabilities: {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  },
  config: [
    { path: "~/.claude/settings.json", scope: "user", level: "official" },
    {
      path: "~/.claude.json",
      scope: "user",
      level: "official",
      note: "Global MCP server configurations.",
    },
    {
      path: ".claude/settings.json",
      scope: "project",
      level: "official",
    },
    {
      path: ".claude/settings.local.json",
      scope: "project",
      level: "official",
      note: "Local overrides, typically gitignored.",
    },
    {
      path: ".claude/.mcp.json",
      scope: "project",
      level: "official",
      note: "Project-scoped MCP server configurations.",
    },
    {
      path: "/etc/claude-code/managed-settings.json",
      scope: "system",
      level: "official",
      platforms: ["linux"],
      note: "Enterprise managed settings.",
    },
    {
      path: "/Library/Application Support/ClaudeCode/managed-settings.json",
      scope: "system",
      level: "official",
      platforms: ["darwin"],
      note: "Enterprise managed settings.",
    },
  ],
  sessions: [
    {
      path: "~/.claude/projects/<project-path>/sessions/*.jsonl",
      scope: "data",
      level: "official",
      note: "Per-project session transcripts in JSONL format.",
    },
    {
      path: "~/.claude/history.jsonl",
      scope: "data",
      level: "official",
      note: "Global prompt history across all projects.",
    },
  ],
  persistence: [
    { format: "JSON", level: "official", note: "Settings and MCP config files." },
    {
      format: "JSONL",
      level: "official",
      note: "Session transcripts and global history.",
    },
  ],
  instructions: [
    { path: "CLAUDE.md", scope: "project", level: "official" },
    {
      path: ".claude/CLAUDE.md",
      scope: "project",
      level: "official",
      note: "Alternative project-level location.",
    },
    {
      path: "~/.claude/CLAUDE.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ],
  skills: [
    { path: ".claude/skills/", scope: "project", level: "official" },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
  ],
  commands: [
    {
      path: ".claude/commands/",
      scope: "project",
      level: "official",
      note: "Legacy slash commands, merged into skills.",
    },
    {
      path: "~/.claude/commands/",
      scope: "user",
      level: "official",
      note: "Legacy global slash commands.",
    },
  ],
  hooks: [
    { path: ".claude/hooks/", scope: "project", level: "official" },
    {
      path: "~/.claude/hooks/",
      scope: "user",
      level: "official",
      note: "Global user-level hooks.",
    },
  ],
  detection: {
    envVars: ["CLAUDE_CODE", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CONFIG_DIR"],
    projectMarkers: [
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".claude/skills",
      "CLAUDE.md",
    ],
  },
});
