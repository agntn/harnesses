import { Harness } from "../harness.ts";
import type { AvailableModel } from "../types.ts";

/**
 * Parses `kilo models`: one `provider/model` per line, where the model id
 * may hold slashes of its own (`kilo/~anthropic/claude-opus-latest`).
 *
 * @param stdout - Native model-listing output.
 * @returns {AvailableModel[]} The listed models, split at the first slash.
 */
export function parseKiloModels(stdout: string): AvailableModel[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const slash = line.indexOf("/");
      if (slash < 1 || slash === line.length - 1 || /\s/.test(line))
        throw new Error(`Unexpected Kilo model-list row: ${JSON.stringify(line)}`);
      return { provider: line.slice(0, slash), id: line.slice(slash + 1) };
    });
}

export default class Kilo extends Harness {
  readonly id = "kilo";
  readonly name = "Kilo Code CLI";
  readonly binaries = ["kilo"];
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
      path: "~/.config/kilo/kilo.jsonc",
      scope: "user",
      level: "official",
      note: "XDG-based, same path on all platforms. kilo.json and config.json beside it are merged too.",
    },
    { path: "~/.config/kilo/kilo.json", scope: "user", level: "official" },
    { path: "kilo.jsonc", scope: "project", level: "official" },
    { path: "kilo.json", scope: "project", level: "official" },
    {
      path: ".kilo/kilo.jsonc",
      scope: "project",
      level: "official",
      note: "Wins over the root file when both exist.",
    },
    { path: ".kilo/kilo.json", scope: "project", level: "official" },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.local/share/kilo/kilo.db",
      scope: "data",
      level: "official",
      note: "SQLite database with sessions, messages and parts, an older OpenCode schema. XDG-based, same path on all platforms.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON/JSONC", level: "official", note: "Config files." },
    { format: "SQLite", level: "official", note: "Session and message storage." },
  ];
  readonly instructions: Harness["instructions"] = [
    { path: "AGENTS.md", scope: "project", level: "official" },
    {
      path: "CLAUDE.md",
      scope: "project",
      level: "official",
      note: "Supported for Claude Code compatibility.",
    },
    { path: "CONTEXT.md", scope: "project", level: "official", note: "Deprecated." },
    {
      path: "~/.config/kilo/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
    {
      path: "~/.claude/CLAUDE.md",
      scope: "user",
      level: "official",
      note: "Fallback when the Kilo file is missing, until Kilo's Claude Code migration has run.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".kilo/skills/", scope: "project", level: "official" },
    { path: ".kilocode/skills/", scope: "project", level: "official" },
    { path: ".agents/skills/", scope: "project", level: "official" },
    {
      path: ".claude/skills/",
      scope: "project",
      level: "official",
      note: "Claude Code compatible.",
    },
    { path: "~/.config/kilo/skills/", scope: "user", level: "official" },
    { path: "~/.kilo/skills/", scope: "user", level: "official" },
    {
      path: "~/.agents/skills/",
      scope: "user",
      level: "official",
      note: "Read by default, so the Codex skills target covers Kilo too.",
    },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Claude Code compatible, until Kilo's Claude Code migration has run.",
    },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.config/kilo/skills/",
    scope: "user",
    level: "official",
    note: "Kilo also scans ~/.agents/skills/ and ~/.claude/skills/, so after a full sync it finds each skill more than once.",
  };
  readonly commands: Harness["commands"] = [
    {
      path: ".kilo/commands/",
      scope: "project",
      level: "official",
      note: "Markdown slash commands, which Kilo calls workflows.",
    },
    {
      path: "~/.config/kilo/commands/",
      scope: "user",
      level: "official",
      note: "Global Markdown slash commands. /goal is reserved.",
    },
  ];
  override readonly promptTemplates = this.commands;
  override readonly promptTemplateSyncTarget: Harness["promptTemplateSyncTarget"] = {
    path: "~/.config/kilo/commands/",
    scope: "user",
    level: "official",
    format: "markdown",
  };
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["run", "{prompt}"],
    jsonArgs: ["run", "--format", "json", "{prompt}"],
    modelArgs: ["--model", "{model}"],
    effortArgs: ["--variant", "{effort}"],
    noExtensionsArgs: ["--pure"],
    level: "official",
    note: "--variant is the provider's reasoning effort; --pure skips external plugins.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["models"],
    level: "official",
    note: "Prints provider/model per line. Its one argument filters by provider, not by name.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.config/kilo/kilo.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcp"],
      dialect: "opencode",
      note: "kilo.jsonc is merged over it, so servers kept there stay out of this listing.",
    },
    {
      path: "kilo.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcp"],
      dialect: "opencode",
    },
  ];
  override readonly agentsFile = "~/.config/kilo/AGENTS.md";
  readonly detection = {
    envVars: ["KILO_PID"],
    projectMarkers: [".kilo", ".kilocode", "kilo.jsonc", "kilo.json"],
  };

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    return parseKiloModels(stdout);
  }
}
