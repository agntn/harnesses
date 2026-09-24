import { stripVTControlCharacters } from "node:util";
import { Harness } from "../harness.ts";
import type { AvailableModel } from "../types.ts";

/**
 * Parses `agy models`: one `id<TAB>label` row per model on stdout, while the
 * `Fetching available models...` line goes to stderr. Every model runs through
 * Google's Antigravity service, the Claude and GPT-OSS ones included, so they
 * all carry the `google` provider.
 *
 * @param stdout - Native model-listing output.
 * @returns {AvailableModel[]} The listed models, in the CLI's order.
 */
export function parseAntigravityModels(stdout: string): AvailableModel[] {
  const lines = stripVTControlCharacters(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Unexpected empty Antigravity model-list output");

  return lines.map((line) => {
    const match = /^(\S+)\t.+$/.exec(line);
    if (!match?.[1])
      throw new Error(`Unexpected Antigravity model-list row: ${JSON.stringify(line)}`);
    return { provider: "google", id: match[1] };
  });
}

export default class Antigravity extends Harness {
  readonly id = "antigravity";
  readonly name = "Google Antigravity CLI";
  readonly binaries = ["agy"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: true,
    video: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.gemini/config/config.json",
      scope: "user",
      level: "official",
      note: "Shared Antigravity configuration and user settings.",
    },
    {
      path: "~/.gemini/antigravity-cli/settings.json",
      scope: "user",
      level: "official",
      note: "CLI-specific settings, including trusted workspaces.",
    },
    {
      path: "~/.gemini/config/skills.json",
      scope: "user",
      level: "official",
      note: "Explicit registrations of skill directories outside the default locations.",
    },
    {
      path: "~/.gemini/config/plugins.json",
      scope: "user",
      level: "official",
      note: "Explicit registrations of plugin directories outside the default locations.",
    },
    {
      path: ".agents/skills.json",
      scope: "project",
      level: "official",
      note: "Workspace registrations of skill directories outside .agents/skills/.",
    },
    {
      path: ".agents/plugins.json",
      scope: "project",
      level: "official",
      note: "Workspace registrations of plugin directories outside .agents/plugins/.",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.gemini/antigravity-cli/conversations/",
      scope: "data",
      level: "official",
      note: "Persisted CLI conversations.",
    },
    {
      path: "~/.gemini/antigravity-cli/history.jsonl",
      scope: "data",
      level: "official",
      note: "CLI prompt history.",
    },
    {
      path: "~/.gemini/antigravity-cli/conversation_summaries.db",
      scope: "data",
      level: "official",
      note: "Conversation summary index.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Settings and project metadata." },
    { format: "JSONL", level: "official", note: "Prompt history." },
    { format: "SQLite", level: "official", note: "Conversation summary index." },
    { format: "Protocol Buffers", level: "official", note: "Conversation and runtime state." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "~/.gemini/config/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global rules in the shared Antigravity customization root.",
    },
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Workspace instructions; GEMINI.md is also supported.",
    },
    {
      path: "GEMINI.md",
      scope: "project",
      level: "official",
      note: "Workspace instructions compatible with Gemini CLI.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".agents/skills/", scope: "project", level: "official" },
    { path: "~/.gemini/config/skills/", scope: "user", level: "official" },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.gemini/config/skills/",
    scope: "user",
    level: "official",
  };
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [
    { path: ".agents/hooks.json", scope: "project", level: "official" },
    { path: "~/.gemini/config/hooks.json", scope: "user", level: "official" },
  ];
  readonly invocation: Harness["invocation"] = {
    args: ["--print", "{prompt}"],
    jsonArgs: ["--print", "--output-format", "json", "{prompt}"],
    modelArgs: ["--model", "{model}"],
    level: "official",
    note: "Non-interactive print mode.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["models"],
    level: "official",
    note: "Prints one id and display name per row, with no default marked and no filter; verified with 1.2.5.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.gemini/config/mcp_config.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "antigravity",
    },
  ];
  override readonly agentsFile = "~/.gemini/config/AGENTS.md";
  readonly detection = {
    envVars: [],
    projectMarkers: [".antigravitycli"],
  };

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    return parseAntigravityModels(stdout);
  }

  /**
   * `agy --model` refuses `google/<id>`, so the bare id is the selector.
   *
   * @param model - A model returned by {@link listModels}.
   * @returns {string} The model id.
   */
  override modelSelector(model: Readonly<AvailableModel>): string {
    return model.id;
  }
}
