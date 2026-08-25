import { Harness } from "../harness.ts";

export default class Claude extends Harness {
  readonly id = "claude";
  readonly name = "Anthropic Claude Code";
  readonly binaries = ["claude"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
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
  ];
  readonly sessions: Harness["sessions"] = [
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
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Settings and MCP config files." },
    {
      format: "JSONL",
      level: "official",
      note: "Session transcripts and global history.",
    },
  ];
  readonly instructions: Harness["instructions"] = [
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
  ];
  readonly skills: Harness["skills"] = [
    { path: ".claude/skills/", scope: "project", level: "official" },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
  ];
  readonly commands: Harness["commands"] = [
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
  ];
  readonly hooks: Harness["hooks"] = [
    { path: ".claude/hooks/", scope: "project", level: "official" },
    {
      path: "~/.claude/hooks/",
      scope: "user",
      level: "official",
      note: "Global user-level hooks.",
    },
  ];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    level: "official",
    note: "Headless print mode; add --output-format json for structured output.",
  };
  readonly detection = {
    envVars: ["CLAUDE_CODE", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CONFIG_DIR"],
    projectMarkers: [
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".claude/skills",
      "CLAUDE.md",
    ],
  };
}
