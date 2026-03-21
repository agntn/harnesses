import type { ClientDefinition } from "../types.ts";

export default {
  id: "github-copilot",
  name: "GitHub Copilot",
  binaries: [],
  capabilities: {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  },
  config: [
    {
      path: "~/.copilot/config.json",
      scope: "user",
      level: "inferred",
    },
  ],
  sessions: [],
  persistence: [{ format: "JSON", level: "official", note: "Configuration files." }],
  instructions: [
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
  ],
  skills: [
    { path: ".github/skills/", scope: "project", level: "official" },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Copilot auto-detects Claude skills directory.",
    },
  ],
  commands: [],
  hooks: [],
  detection: {
    envVars: ["COPILOT_RUN_APP"],
    projectMarkers: [".github/copilot-instructions.md", ".github/skills", ".github/instructions"],
  },
} satisfies ClientDefinition;
