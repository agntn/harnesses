import { Client } from "../client.ts";

export default class GitHubCopilot extends Client {
  readonly id = "github-copilot";
  readonly name = "GitHub Copilot";
  readonly binaries = [];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Client["config"] = [
    {
      path: "~/.copilot/config.json",
      scope: "user",
      level: "inferred",
    },
  ];
  readonly sessions: Client["sessions"] = [];
  readonly persistence: Client["persistence"] = [
    { format: "JSON", level: "official", note: "Configuration files." },
  ];
  readonly instructions: Client["instructions"] = [
    {
      path: ".github/copilot-instructions.md",
      scope: "project",
      level: "official",
    },
    {
      path: ".github/instructions/",
      scope: "project",
      level: "official",
      note: "Modular instructions in .instructions.md files.",
    },
  ];
  readonly skills: Client["skills"] = [
    { path: ".github/skills/", scope: "project", level: "official" },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Copilot auto-detects Claude skills directory.",
    },
  ];
  readonly commands: Client["commands"] = [];
  readonly hooks: Client["hooks"] = [];
  readonly detection = {
    envVars: ["COPILOT_RUN_APP"],
    projectMarkers: [".github/copilot-instructions.md", ".github/skills", ".github/instructions"],
  };
}
