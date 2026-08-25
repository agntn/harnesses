import { Harness } from "../harness.ts";

export default class Gemini extends Harness {
  readonly id = "gemini";
  readonly name = "Google Gemini CLI";
  readonly binaries = ["gemini"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.gemini/settings.json",
      scope: "user",
      level: "official",
    },
    {
      path: ".gemini/settings.json",
      scope: "project",
      level: "official",
    },
    {
      path: "/etc/gemini-cli/settings.json",
      scope: "system",
      level: "official",
      platforms: ["linux"],
    },
    {
      path: "/Library/Application Support/GeminiCli/settings.json",
      scope: "system",
      level: "official",
      platforms: ["darwin"],
    },
    {
      path: "%PROGRAMDATA%/gemini-cli/settings.json",
      scope: "system",
      level: "official",
      platforms: ["win32"],
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.gemini/history/<project-id>/",
      scope: "data",
      level: "official",
      note: "Conversation history per project (project-id is a slug from projects.json).",
    },
    {
      path: "~/.gemini/tmp/<project-id>/chats/",
      scope: "data",
      level: "official",
      note: "Active chat session data.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Settings files." },
    {
      format: "JSON",
      level: "official",
      note: "Session and history records.",
    },
  ];
  readonly instructions: Harness["instructions"] = [
    { path: "GEMINI.md", scope: "project", level: "official" },
    {
      path: "~/.gemini/GEMINI.md",
      scope: "user",
      level: "official",
      note: "Global instruction/memory file.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".gemini/skills/", scope: "project", level: "official" },
    { path: ".agents/skills/", scope: "project", level: "official" },
    { path: "~/.gemini/skills/", scope: "user", level: "official" },
    { path: "~/.agents/skills/", scope: "user", level: "official" },
  ];
  readonly commands: Harness["commands"] = [
    {
      path: ".gemini/commands/",
      scope: "project",
      level: "official",
      note: "Custom commands in TOML format.",
    },
    {
      path: "~/.gemini/commands/",
      scope: "user",
      level: "official",
      note: "Global custom commands in TOML format.",
    },
  ];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "{prompt}", "--output-format", "json"],
    level: "official",
    note: "Non-interactive (headless) mode.",
  };
  readonly detection = {
    envVars: ["GEMINI_CLI"],
    projectMarkers: [".gemini", "GEMINI.md"],
  };
}
