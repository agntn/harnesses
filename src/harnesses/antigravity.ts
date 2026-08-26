import { Harness } from "../harness.ts";

export default class Antigravity extends Harness {
  readonly id = "antigravity";
  readonly name = "Google Antigravity CLI";
  readonly binaries = ["agy"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.gemini/config/config.json",
      scope: "user",
      level: "official",
      note: "Shared Antigravity configuration and user settings.",
    },
    {
      path: "~/.gemini/antigravity-cli/settings.json",
      scope: "user",
      level: "official",
      note: "CLI-specific settings, including trusted workspaces.",
    },
    {
      path: "~/.gemini/config/skills.json",
      scope: "user",
      level: "official",
      note: "Explicit registrations of skill directories outside the default locations.",
    },
    {
      path: "~/.gemini/config/plugins.json",
      scope: "user",
      level: "official",
      note: "Explicit registrations of plugin directories outside the default locations.",
    },
    {
      path: ".agents/skills.json",
      scope: "project",
      level: "official",
      note: "Workspace registrations of skill directories outside .agents/skills/.",
    },
    {
      path: ".agents/plugins.json",
      scope: "project",
      level: "official",
      note: "Workspace registrations of plugin directories outside .agents/plugins/.",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.gemini/antigravity-cli/conversations/",
      scope: "data",
      level: "official",
      note: "Persisted CLI conversations.",
    },
    {
      path: "~/.gemini/antigravity-cli/history.jsonl",
      scope: "data",
      level: "official",
      note: "CLI prompt history.",
    },
    {
      path: "~/.gemini/antigravity-cli/conversation_summaries.db",
      scope: "data",
      level: "official",
      note: "Conversation summary index.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Settings and project metadata." },
    { format: "JSONL", level: "official", note: "Prompt history." },
    { format: "SQLite", level: "official", note: "Conversation summary index." },
    { format: "Protocol Buffers", level: "official", note: "Conversation and runtime state." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "~/.gemini/config/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global rules in the shared Antigravity customization root.",
    },
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Workspace instructions; GEMINI.md is also supported.",
    },
    {
      path: "GEMINI.md",
      scope: "project",
      level: "official",
      note: "Workspace instructions compatible with Gemini CLI.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".agents/skills/", scope: "project", level: "official" },
    { path: "~/.gemini/config/skills/", scope: "user", level: "official" },
  ];
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [
    { path: ".agents/hooks.json", scope: "project", level: "official" },
    { path: "~/.gemini/config/hooks.json", scope: "user", level: "official" },
  ];
  readonly invocation: Harness["invocation"] = {
    args: ["--print", "{prompt}"],
    jsonArgs: ["--print", "--output-format", "json", "{prompt}"],
    level: "official",
    note: "Non-interactive print mode.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.gemini/config/mcp_config.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "antigravity",
    },
  ];
  override readonly agentsFile = "~/.gemini/config/AGENTS.md";
  readonly detection = {
    envVars: [],
    projectMarkers: [".antigravitycli"],
  };
}
