import { Harness } from "../harness.ts";

export default class Cursor extends Harness {
  readonly id = "cursor";
  readonly name = "Cursor";
  readonly binaries = ["cursor"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.cursor/settings.json",
      scope: "user",
      level: "official",
    },
  ];
  readonly sessions: Harness["sessions"] = [];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Settings and rules files." },
  ];
  readonly instructions: Harness["instructions"] = [
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
  readonly skills: Harness["skills"] = [
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
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    binary: "cursor-agent",
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "--output-format", "json", "{prompt}"],
    level: "community",
    note: "Cursor CLI agent binary, separate from the editor binary.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.cursor/mcp.json",
      scope: "user",
      level: "community",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
    {
      path: ".cursor/mcp.json",
      scope: "project",
      level: "community",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
  ];
  readonly detection = {
    envVars: ["CURSOR_SESSION", "CURSOR_TRACE_ID"],
    projectMarkers: [".cursor", ".cursorrules"],
  };
}
