import { Harness } from "../harness.ts";

export default class OpenCode extends Harness {
  readonly id = "opencode";
  readonly name = "OpenCode CLI";
  readonly binaries = ["opencode"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
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
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.local/share/opencode/opencode.db",
      scope: "data",
      level: "official",
      note: "SQLite database with sessions, messages, and parts. XDG-based, same path on all platforms.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON/JSONC", level: "official", note: "Config files." },
    {
      format: "SQLite",
      level: "official",
      note: "Session and message storage via Drizzle ORM.",
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
      path: "~/.config/opencode/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ];
  readonly skills: Harness["skills"] = [
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
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["run", "{prompt}"],
    jsonArgs: ["run", "--format", "json", "{prompt}"],
    modelArgs: ["--model", "{model}"],
    level: "official",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.config/opencode/opencode.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcp"],
      dialect: "opencode",
    },
    {
      path: "opencode.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcp"],
      dialect: "opencode",
    },
  ];
  override readonly agentsFile = "~/.config/opencode/AGENTS.md";
  readonly detection = {
    envVars: [],
    projectMarkers: [".opencode", "opencode.jsonc", "opencode.json"],
  };
}
