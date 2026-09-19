import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { Harness } from "../harness.ts";

function packageVersion(commandPath: string): string | null {
  try {
    const require = createRequire(realpathSync(commandPath));
    const metadata: unknown = JSON.parse(
      readFileSync(require.resolve("mastracode/package.json"), "utf8"),
    );
    if (
      typeof metadata === "object" &&
      metadata !== null &&
      "version" in metadata &&
      typeof metadata.version === "string" &&
      metadata.version !== ""
    ) {
      return metadata.version;
    }
  } catch {
    return null;
  }
  return null;
}

export default class MastraCode extends Harness {
  readonly id = "mastracode";
  readonly name = "Mastra Code";
  readonly binaries = ["mastracode"];

  override get version(): string | null {
    const locator = process.platform === "win32" ? "where" : "which";
    let output: string;
    try {
      output = execFileSync(locator, [this.binaries[0] ?? "mastracode"], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      });
    } catch {
      return null;
    }

    const paths = output.split(/\r?\n/u).filter((path) => path !== "");
    for (const path of paths) {
      const version = packageVersion(path);
      if (version !== null) return version;
    }
    return null;
  }
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
      path: ".mastracode/mcp.json",
      scope: "project",
      level: "official",
      note: "Project-scoped MCP server configurations.",
    },
    {
      path: "~/.mastracode/mcp.json",
      scope: "user",
      level: "official",
      note: "Global MCP server configurations.",
    },
    {
      path: ".mcp.json",
      scope: "project",
      level: "official",
      note: "Claude Code compatible project MCP servers, read below .mastracode/mcp.json.",
    },
    {
      path: ".mastracode/hooks.json",
      scope: "project",
      level: "official",
      note: "Project-scoped hooks.",
    },
    {
      path: "~/.mastracode/hooks.json",
      scope: "user",
      level: "official",
      note: "Global hooks.",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.local/share/mastracode/mastra.db",
      scope: "data",
      level: "official",
      platforms: ["linux"],
      note: "LibSQL database with threads, messages, and observational memory.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "MCP and hooks config files." },
    {
      format: "SQLite",
      level: "official",
      note: "LibSQL database for threads, messages, and observational memory.",
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
      path: ".claude/CLAUDE.md",
      scope: "project",
      level: "official",
      note: "Claude Code compatible.",
    },
    {
      path: ".mastracode/AGENTS.md",
      scope: "project",
      level: "official",
      note: "Alternative project-level location.",
    },
    {
      path: "~/.claude/CLAUDE.md",
      scope: "user",
      level: "official",
      note: "Claude Code compatible.",
    },
    {
      path: "~/.mastracode/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".mastracode/skills/", scope: "project", level: "official" },
    {
      path: "~/.mastracode/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Claude Code compatible.",
    },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Claude Code compatible.",
    },
  ];
  readonly commands: Harness["commands"] = [
    {
      path: ".mastracode/commands/",
      scope: "project",
      level: "official",
      note: "Markdown prompt commands; subdirectories become colon-separated command names.",
    },
    {
      path: "~/.mastracode/commands/",
      scope: "user",
      level: "official",
      note: "Global Markdown prompt commands.",
    },
    {
      path: ".claude/commands/",
      scope: "project",
      level: "official",
      note: "Claude compatibility.",
    },
    {
      path: "~/.claude/commands/",
      scope: "user",
      level: "official",
      note: "Claude compatibility.",
    },
    {
      path: ".opencode/command/",
      scope: "project",
      level: "official",
      note: "Mastra's OpenCode compatibility loader uses the singular command directory.",
    },
    {
      path: "~/.opencode/command/",
      scope: "user",
      level: "official",
      note: "Mastra's OpenCode compatibility loader uses the singular command directory.",
    },
  ];
  override readonly promptTemplates = this.commands;
  readonly hooks: Harness["hooks"] = [
    {
      path: ".mastracode/hooks.json",
      scope: "project",
      level: "official",
    },
    {
      path: "~/.mastracode/hooks.json",
      scope: "user",
      level: "official",
      note: "Global hooks.",
    },
  ];
  readonly invocation: Harness["invocation"] = null;
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.mastracode/mcp.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "mastracode",
      note: "An entry with command is stdio and one with url is HTTP, type is ignored. Loaded above mcpServers from the project's .claude/settings.local.json and below both project files, later names winning.",
    },
    {
      path: ".mastracode/mcp.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "mastracode",
      note: "Highest priority, overrides the other files entry by entry.",
    },
    {
      path: ".mcp.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "mastracode",
      note: "Claude Code's project file, read between the user file and .mastracode/mcp.json. Project writes go to .mastracode/mcp.json, this one is Claude's to edit.",
    },
  ];
  readonly detection = {
    envVars: [],
    projectMarkers: [".mastracode"],
  };
}
