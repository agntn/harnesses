import { Harness } from "../harness.ts";

export default class Freebuff extends Harness {
  readonly id = "freebuff";
  readonly name = "Freebuff";
  readonly binaries = ["freebuff"];
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
      path: "~/.config/manicode/settings.json",
      scope: "user",
      level: "official",
      note: "Freebuff is Codebuff-based; user data lives under ~/.config/manicode/ on all platforms.",
    },
    {
      path: "~/.config/manicode/credentials.json",
      scope: "user",
      level: "official",
      note: "Authentication credentials.",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.config/manicode/projects/<project-name>/chats/<timestamp>/",
      scope: "data",
      level: "official",
      note: "Per-chat directories with chat-messages.json, chat-meta.json, run-state.json, and log.jsonl.",
    },
    {
      path: "~/.config/manicode/message-history.json",
      scope: "data",
      level: "official",
      note: "Prompt history.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    {
      format: "JSON",
      level: "official",
      note: "Settings, credentials, chat messages, and run state.",
    },
    { format: "JSONL", level: "official", note: "Per-chat logs (log.jsonl)." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Knowledge files; scaffolded by the init flow. knowledge.md, *.knowledge.md, and CLAUDE.md in any project directory are loaded the same way.",
    },
    {
      path: "knowledge.md",
      scope: "project",
      level: "official",
      note: "Per-directory project knowledge.",
    },
    {
      path: "~/.AGENTS.md",
      scope: "user",
      level: "official",
      note: "User-level knowledge files in the home directory; ~/.knowledge.md and ~/.CLAUDE.md are accepted too. Read-only for the agent.",
    },
  ];
  readonly skills: Harness["skills"] = [
    {
      path: ".agents/skills/",
      scope: "project",
      level: "official",
      note: "Also the install target for community skills via npx skills add; .agents/types/ holds agent template types.",
    },
  ];
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = null;
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.agents/mcp.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
    {
      path: ".agents/mcp.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
      note: "The parent directory's .agents/mcp.json is scanned too; agent templates can also embed their own mcpServers.",
    },
  ];
  override readonly agentsFile = "~/.AGENTS.md";
  readonly detection = {
    envVars: [],
    projectMarkers: [".agents", "knowledge.md"],
  };
}
