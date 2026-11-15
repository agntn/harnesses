import { execFileSync } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { Harness } from "../harness.ts";
import type {
  AvailableModel,
  InvokeOptions,
  InvokeResult,
  ListModelsOptions,
  ListModelsResult,
} from "../types.ts";

const MODEL_HEADERS = ["provider", "model", "context", "max-out", "thinking", "images"];

/** Pi reads `--tools` as an allowlist: no extension tools, no codemode or tool_search for MCP. */
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

/** Pi prints its bare version; CLN's `pi` calculator prints `pi (CLN 1.3.7)`. */
const PI_VERSION = /^v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*$/u;

function parseTokenCount(value: string, harness: string): number {
  const match = /^(\d+(?:\.\d+)?)([KM])?$/.exec(value);
  if (!match?.[1]) throw new Error(`Invalid ${harness} token count: ${JSON.stringify(value)}`);
  const multiplier = match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return Number(match[1]) * multiplier;
}

function parseBoolean(value: string, column: string, harness: string): boolean {
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new Error(`Invalid ${harness} ${column} value: ${JSON.stringify(value)}`);
}

/**
 * Parses the model table Pi and its forks print, one row per model with
 * two or more spaces between columns.
 *
 * @param stdout - Native model-listing output.
 * @param harness - Harness name for error messages.
 * @returns {AvailableModel[]} The normalized models; empty when the CLI reports no matching models.
 */
export function parsePiModelTable(stdout: string, harness: string): AvailableModel[] {
  const lines = stripVTControlCharacters(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0];
  if (!first) throw new Error(`Unexpected empty ${harness} model-list output`);
  if (first.startsWith("No models available.") || first.startsWith("No models matching ")) {
    return [];
  }

  const headers = first.split(/\s{2,}/);
  if (
    headers.length !== MODEL_HEADERS.length ||
    headers.some((value, i) => value !== MODEL_HEADERS[i])
  ) {
    throw new Error(`Unexpected ${harness} model-list header: ${JSON.stringify(first)}`);
  }

  return lines.slice(1).map((line) => {
    const columns = line.split(/\s{2,}/);
    const [provider, id, context, maxOutput, thinking, images] = columns;
    if (
      columns.length !== MODEL_HEADERS.length ||
      !provider ||
      !id ||
      !context ||
      !maxOutput ||
      !thinking ||
      !images
    ) {
      throw new Error(`Unexpected ${harness} model-list row: ${JSON.stringify(line)}`);
    }
    return {
      provider,
      id,
      contextWindow: parseTokenCount(context, harness),
      maxOutputTokens: parseTokenCount(maxOutput, harness),
      thinking: parseBoolean(thinking, "thinking", harness),
      images: parseBoolean(images, "images", harness),
    };
  });
}

/** A spawn as `invoke` makes it: the caller's env merged over this process's. */
interface Spawn {
  readonly command: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * Asks the binary a spawn would start for its version.
 *
 * @param spawn - Command, working directory and env overrides.
 * @returns {{ found: boolean, version: string | null }} Whether it ran, and its Pi version.
 */
function askVersion(spawn: Spawn): { found: boolean; version: string | null } {
  try {
    const output = execFileSync(spawn.command, ["--version"], {
      cwd: spawn.cwd,
      env: spawn.env ? { ...process.env, ...spawn.env } : process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    return { found: true, version: PI_VERSION.exec(output)?.[1] ?? null };
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    return { found: !missing, version: null };
  }
}

/**
 * @param spawn - Command, working directory and env overrides.
 * @returns {string | null} Why that binary can't run, or null when it's Pi or missing.
 */
function impostorError(spawn: Spawn): string | null {
  if (process.platform === "win32") return null;
  const { found, version } = askVersion(spawn);
  if (!found || version !== null) return null;
  return (
    "The pi on PATH isn't the Pi coding agent: its --version names no Pi release. " +
    "Put the coding agent's directory first on PATH"
  );
}

export default class Pi extends Harness {
  readonly id = "pi";
  readonly name = "Pi Coding Agent";
  readonly binaries = ["pi"];

  #probe: { path: string | undefined; at: number; version: string | null } | undefined;

  /**
   * A `pi` that doesn't print a bare Pi version is someone else's. Windows keeps the PATH check.
   *
   * @returns {boolean} Whether the `pi` on PATH is the coding agent.
   */
  override isInstalled(): boolean {
    if (!super.isInstalled()) return false;
    return process.platform === "win32" || this.version !== null;
  }

  /**
   * Detection reads this right after `isInstalled()`, so one probe serves both for a second.
   *
   * @returns {string | null} The Pi version, or null when no `pi` answers like Pi.
   */
  override get version(): string | null {
    const path = process.env.PATH;
    const now = performance.now();
    const probe = this.#probe;
    if (probe !== undefined && probe.path === path && now - probe.at < 1000) return probe.version;
    const { version } = askVersion({ command: this.binaries[0] ?? "pi" });
    this.#probe = { path, at: now, version };
    return version;
  }

  override invoke(prompt: string, options: InvokeOptions = {}): Promise<InvokeResult> {
    const command = this.invocation?.binary ?? this.binaries[0] ?? "pi";
    const error = impostorError({ command, cwd: options.cwd, env: options.env });
    return error === null ? super.invoke(prompt, options) : Promise.reject(new Error(error));
  }

  override listModels(options: ListModelsOptions = {}): Promise<ListModelsResult> {
    const command = this.binaries[0] ?? "pi";
    const error = impostorError({ command, cwd: options.cwd, env: options.env });
    return error === null ? super.listModels(options) : Promise.reject(new Error(error));
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
      path: "~/.pi/agent/settings.json",
      scope: "user",
      level: "official",
    },
    { path: ".pi/settings.json", scope: "project", level: "official" },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.pi/agent/sessions/<dash-encoded-cwd>/<timestamp>_<session-id>.jsonl",
      scope: "data",
      level: "official",
      note: "Per-project session transcripts in JSONL format; session ids are UUIDv7. Overridable with --session-dir.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    {
      format: "JSON",
      level: "official",
      note: "Settings, auth, trust, models, and keybindings files.",
    },
    { format: "JSONL", level: "official", note: "Session transcripts." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Loaded from parent directories and cwd; CLAUDE.md accepted as an alternative, AGENTS.override.md takes precedence over both in a directory.",
    },
    {
      path: ".pi/SYSTEM.md",
      scope: "project",
      level: "official",
      note: "Replaces the default system prompt; APPEND_SYSTEM.md appends instead.",
    },
    {
      path: "~/.pi/agent/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
    {
      path: "~/.pi/agent/SYSTEM.md",
      scope: "user",
      level: "official",
      note: "Global system prompt replacement; APPEND_SYSTEM.md appends instead.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".pi/skills/", scope: "project", level: "official" },
    {
      path: "~/.pi/agent/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.pi/agent/skills/",
    scope: "user",
    level: "official",
  };
  readonly commands: Harness["commands"] = [
    {
      path: ".pi/prompts/",
      scope: "project",
      level: "official",
      note: "Prompt templates invoked as slash commands.",
    },
    {
      path: "~/.pi/agent/prompts/",
      scope: "user",
      level: "official",
      note: "Global user-level prompt templates.",
    },
  ];
  override readonly promptTemplates = this.commands;
  override readonly promptTemplateSyncTarget: Harness["promptTemplateSyncTarget"] = {
    path: "~/.pi/agent/prompts/",
    scope: "user",
    level: "official",
    format: "markdown",
  };
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "--mode", "json", "{prompt}"],
    noToolsArgs: ["-p", "--no-tools", "{prompt}"],
    noToolsJsonArgs: ["-p", "--no-tools", "--mode", "json", "{prompt}"],
    readOnlyArgs: ["-p", "--tools", READ_ONLY_TOOLS.join(","), "{prompt}"],
    readOnlyJsonArgs: ["-p", "--tools", READ_ONLY_TOOLS.join(","), "--mode", "json", "{prompt}"],
    readOnlyTools: READ_ONLY_TOOLS,
    modelArgs: ["--model", "{model}"],
    effortArgs: ["--thinking", "{effort}"],
    level: "official",
    note: "Add --mode json for structured event output.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["--list-models"],
    searchArgs: ["--list-models", "{search}"],
    level: "official",
    note: "Lists models with configured provider authentication; accepts an optional fuzzy search.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.pi/agent/mcp.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "pi",
      note: "Read by the built-in MCP extension, which -builtin:mcp in the extensions setting turns off.",
    },
    {
      path: ".pi/mcp.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "pi",
      note: "Read only after the project is trusted.",
    },
  ];
  override readonly envOverrides: Harness["envOverrides"] = [
    {
      variable: "PI_CODING_AGENT_DIR",
      path: "~/.pi/agent",
      scope: "user",
      level: "official",
      relocates: ["config", "sessions", "instructions", "skills", "commands", "promptTemplates"],
      note: "A leading ~ in the value is expanded.",
    },
    {
      variable: "PI_CODING_AGENT_SESSION_DIR",
      path: "~/.pi/agent/sessions",
      scope: "data",
      level: "official",
      relocates: ["sessions"],
      note: "Takes precedence over PI_CODING_AGENT_DIR for sessions; --session-dir beats both.",
    },
  ];
  override readonly agentsFile = "~/.pi/agent/AGENTS.md";
  readonly detection = {
    envVars: ["PI_CODING_AGENT", "PI_SESSION_ID", "PI_SESSION_FILE"],
    projectMarkers: [".pi"],
  };

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    return parsePiModelTable(stdout, "Pi");
  }
}
