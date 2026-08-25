import { Client } from "../client.ts";

export default class Cursor extends Client {
  readonly id = "cursor";
  readonly name = "Cursor";
  readonly binaries = ["cursor"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Client["config"] = [
    {
      path: "~/.cursor/settings.json",
      scope: "user",
      level: "official",
    },
  ];
  readonly sessions: Client["sessions"] = [];
  readonly persistence: Client["persistence"] = [
    { format: "JSON", level: "official", note: "Settings and rules files." },
  ];
  readonly instructions: Client["instructions"] = [
    {
      path: ".cursor/rules/skilld-activation.mdc",
      scope: "project",
      level: "official",
      note: "MDC format rule for skill activation.",
    },
    {
      path: ".cursorrules",
      scope: "project",
      level: "official",
      note: "Legacy project-level instructions.",
    },
  ];
  readonly skills: Client["skills"] = [
    { path: ".cursor/skills/", scope: "project", level: "official" },
    {
      path: "~/.cursor/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Cursor natively scans Claude skills directory.",
    },
    {
      path: ".codex/skills/",
      scope: "project",
      level: "official",
      note: "Cursor natively scans Codex skills directory.",
    },
  ];
  readonly commands: Client["commands"] = [];
  readonly hooks: Client["hooks"] = [];
  readonly detection = {
    envVars: ["CURSOR_SESSION", "CURSOR_TRACE_ID"],
    projectMarkers: [".cursor", ".cursorrules"],
  };
}
