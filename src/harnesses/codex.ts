import { Harness } from "../harness.ts";
import type { AvailableModel } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps one catalog entry, or skips it when Codex leaves it out of its own picker.
 *
 * @param entry - One element of `models`.
 * @returns {AvailableModel | undefined} The model, or undefined for a hidden one.
 */
function codexModel(entry: unknown): AvailableModel | undefined {
  if (!isRecord(entry) || typeof entry["slug"] !== "string")
    throw new Error(`Unexpected Codex model-list entry: ${JSON.stringify(entry)?.slice(0, 200)}`);
  if (entry["visibility"] !== "list") return undefined;
  const {
    display_name: name,
    context_window: contextWindow,
    supported_reasoning_levels: levels,
    input_modalities: input,
  } = entry;
  return {
    provider: "openai",
    id: entry["slug"],
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof contextWindow === "number" ? { contextWindow } : {}),
    ...(Array.isArray(levels) ? { thinking: levels.length > 0 } : {}),
    ...(Array.isArray(input) ? { images: input.includes("image") } : {}),
  };
}

/**
 * Parses `codex debug models`, the catalog Codex picks from, minus the models it hides.
 *
 * @param stdout - Native model-listing output.
 * @returns {AvailableModel[]} The listed models, in the CLI's order.
 */
export function parseCodexModels(stdout: string): AvailableModel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Unexpected Codex model-list output: ${JSON.stringify(stdout.slice(0, 200))}`);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["models"]))
    throw new Error(`Unexpected Codex model-list output: ${JSON.stringify(stdout.slice(0, 200))}`);

  return parsed["models"].flatMap((entry: unknown) => codexModel(entry) ?? []);
}

export default class Codex extends Harness {
  readonly id = "codex";
  readonly name = "OpenAI Codex CLI";
  readonly binaries = ["codex"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    { path: "~/.codex/config.toml", scope: "user", level: "official" },
    {
      path: ".codex/config.toml",
      scope: "project",
      level: "official",
      note: "Searched from cwd up to project root (.git boundary).",
    },
    {
      path: "/etc/codex/config.toml",
      scope: "system",
      level: "official",
      platforms: ["linux", "darwin"],
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.codex/sessions/",
      scope: "data",
      level: "official",
      note: "Session rollouts in JSONL format, organized by date.",
    },
    {
      path: "~/.codex/history.jsonl",
      scope: "data",
      level: "official",
      note: "Command history.",
    },
    {
      path: "~/.codex/state_5.sqlite",
      scope: "data",
      level: "official",
      note: "SQLite state database for threads and agent state.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "TOML", level: "official", note: "Configuration files." },
    { format: "JSONL", level: "official", note: "Conversation transcripts." },
    { format: "SQLite", level: "official", note: "Thread and agent state." },
  ];
  readonly instructions: Harness["instructions"] = [
    { path: "AGENTS.md", scope: "project", level: "official" },
    {
      path: "AGENTS.override.md",
      scope: "project",
      level: "official",
      note: "Local override, takes precedence over AGENTS.md.",
    },
    {
      path: "~/.codex/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
    {
      path: "~/.codex/AGENTS.override.md",
      scope: "user",
      level: "official",
      note: "Global override, takes precedence over global AGENTS.md.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".codex/skills/", scope: "project", level: "official" },
    { path: ".agents/skills/", scope: "project", level: "official" },
    {
      path: "~/.codex/skills/",
      scope: "user",
      level: "official",
      note: "Deprecated, use ~/.agents/skills/ instead.",
    },
    { path: "~/.agents/skills/", scope: "user", level: "official" },
    {
      path: "/etc/codex/skills/",
      scope: "system",
      level: "official",
      platforms: ["linux", "darwin"],
    },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.agents/skills/",
    scope: "user",
    level: "official",
  };
  readonly commands: Harness["commands"] = [
    {
      path: "~/.codex/prompts/",
      scope: "user",
      level: "official",
      note: "Deprecated Markdown prompts invoked as /prompts:name. Top-level files only; use skills for shared prompts.",
    },
  ];
  override readonly promptTemplates = this.commands;
  override readonly promptTemplateSyncTarget: Harness["promptTemplateSyncTarget"] = {
    path: "~/.codex/prompts/",
    scope: "user",
    level: "official",
    format: "markdown",
  };
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["exec", "--skip-git-repo-check", "{prompt}"],
    jsonArgs: ["exec", "--skip-git-repo-check", "--json", "{prompt}"],
    readOnlyArgs: ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "{prompt}"],
    readOnlyJsonArgs: [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--json",
      "{prompt}",
    ],
    modelArgs: ["--model", "{model}"],
    effortArgs: ["-c", "model_reasoning_effort={effort}"],
    level: "official",
    note: "Non-interactive exec subcommand; add --json for structured output.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["debug", "models"],
    level: "official",
    note: "Prints the model catalog as JSON, refreshed from OpenAI unless --bundled, with no filter of its own; only models Codex shows in its picker are kept. It lives under debug, so the shape can move between releases; verified with 0.160.0.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.codex/config.toml",
      scope: "user",
      level: "official",
      format: "toml",
      key: ["mcp_servers"],
      dialect: "standard",
    },
    {
      path: ".codex/config.toml",
      scope: "project",
      level: "official",
      format: "toml",
      key: ["mcp_servers"],
      dialect: "standard",
    },
  ];
  override readonly envOverrides: Harness["envOverrides"] = [
    {
      variable: "CODEX_HOME",
      path: "~/.codex",
      scope: "user",
      level: "official",
      relocates: ["config", "sessions", "instructions", "skills", "commands", "promptTemplates"],
    },
  ];
  override readonly agentsFile = "~/.codex/AGENTS.md";
  readonly detection = {
    envVars: [],
    projectMarkers: [".codex", "AGENTS.md", "AGENTS.override.md", ".agents/skills"],
  };

  /**
   * `codex --model` takes the bare slug, so the selector leaves `openai/` off.
   *
   * @param model - A model returned by {@link listModels}.
   * @returns {string} The model id.
   */
  override modelSelector(model: Readonly<AvailableModel>): string {
    return model.id;
  }

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    return parseCodexModels(stdout);
  }
}
