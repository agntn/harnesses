import type { ClientDefinition } from "../types.ts";

export default {
  id: "cursor",
  name: "Cursor",
  binaries: ["cursor"],
  capabilities: {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  },
  config: [
    {
      path: "~/.cursor/settings.json",
      scope: "user",
      level: "official",
    },
  ],
  sessions: [],
  persistence: [{ format: "JSON", level: "official", note: "Settings and rules files." }],
  instructions: [
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
  ],
  skills: [
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
  ],
  commands: [],
  hooks: [],
  detection: {
    envVars: ["CURSOR_SESSION", "CURSOR_TRACE_ID"],
    projectMarkers: [".cursor", ".cursorrules"],
  },
} satisfies ClientDefinition;
