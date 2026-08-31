import { Harness } from "../harness.ts";

export default class GitHubCopilot extends Harness {
  readonly id = "github-copilot";
  readonly name = "GitHub Copilot";
  readonly binaries = [];
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
      path: "~/.copilot/config.json",
      scope: "user",
      level: "inferred",
    },
  ];
  readonly sessions: Harness["sessions"] = [];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Configuration files." },
  ];
  readonly instructions: Harness["instructions"] = [
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
  readonly skills: Harness["skills"] = [
    { path: ".github/skills/", scope: "project", level: "official" },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Copilot auto-detects Claude skills directory.",
    },
  ];
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    binary: "copilot",
    args: ["-p", "{prompt}"],
    level: "community",
    note: "GitHub Copilot CLI, separate from the editor integration.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: ".vscode/mcp.json",
      scope: "project",
      level: "community",
      format: "json",
      key: ["servers"],
      dialect: "vscode",
    },
  ];
  readonly detection = {
    envVars: ["COPILOT_RUN_APP"],
    projectMarkers: [".github/copilot-instructions.md", ".github/skills", ".github/instructions"],
  };
}
