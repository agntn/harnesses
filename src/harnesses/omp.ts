import { Harness } from "../harness.ts";

export default class Omp extends Harness {
  readonly id = "omp";
  readonly name = "OMP (oh-my-pi)";
  readonly binaries = ["omp"];
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
      path: "~/.omp/agent/config.yml",
      scope: "user",
      level: "official",
      note: "Profiles use ~/.omp/profiles/<name>/agent.",
    },
    {
      path: "~/.omp/agent/settings.json",
      scope: "user",
      level: "official",
    },
    {
      path: "~/.omp/agent/mcp.json",
      scope: "user",
      level: "official",
      note: "MCP server configurations.",
    },
    { path: ".omp/config.yml", scope: "project", level: "official" },
    { path: ".omp/settings.json", scope: "project", level: "official" },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.omp/agent/sessions/<dash-encoded-cwd>/<timestamp>_<session-id>.jsonl",
      scope: "data",
      level: "official",
      note: "Per-project session transcripts in JSONL format; session ids are UUIDv7.",
    },
    {
      path: "~/.omp/agent/history.db",
      scope: "data",
      level: "official",
      note: "SQLite prompt history.",
    },
    {
      path: "~/.omp/agent/agent.db",
      scope: "data",
      level: "official",
      note: "SQLite agent state database.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "YAML", level: "official", note: "config.yml configuration files." },
    {
      format: "JSON",
      level: "official",
      note: "settings.json and mcp.json.",
    },
    { format: "JSONL", level: "official", note: "Session transcripts." },
    {
      format: "SQLite",
      level: "official",
      note: "Agent state, prompt history, model catalog (agent.db, history.db, models.db).",
    },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Discovered by walking up from cwd; CLAUDE.md and other vendor files loaded via compatibility providers (claude, codex, gemini, cursor, opencode, and more).",
    },
    { path: ".omp/AGENTS.md", scope: "project", level: "official" },
    {
      path: ".omp/RULES.md",
      scope: "project",
      level: "official",
      note: "Sticky always-apply rules.",
    },
    {
      path: "~/.omp/agent/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
    {
      path: "~/.omp/agent/RULES.md",
      scope: "user",
      level: "official",
      note: "Global sticky always-apply rules.",
    },
    {
      path: "~/.omp/agent/PERSONALITY.md",
      scope: "user",
      level: "official",
      note: "Overrides the system prompt's personality block; replaces the configured personality preset.",
    },
  ];
  readonly skills: Harness["skills"] = [
    {
      path: ".omp/skills/",
      scope: "project",
      level: "official",
      note: "Scanned in ancestor directories from cwd, closest first.",
    },
    { path: "~/.omp/agent/skills/", scope: "user", level: "official" },
    {
      path: "~/.omp/agent/managed-skills/",
      scope: "user",
      level: "official",
      note: "Auto-generated managed skills.",
    },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.omp/agent/skills/",
    scope: "user",
    level: "official",
  };
  readonly commands: Harness["commands"] = [
    {
      path: ".omp/commands/",
      scope: "project",
      level: "official",
      note: "Markdown prompt commands and TypeScript commands; only Markdown files are templates.",
    },
    {
      path: "~/.omp/agent/commands/",
      scope: "user",
      level: "official",
      note: "Global Markdown prompt commands and TypeScript commands; only Markdown files are templates.",
    },
  ];
  override readonly promptTemplates: Harness["promptTemplates"] = [
    ...this.commands,
    {
      path: ".omp/prompts/",
      scope: "project",
      level: "official",
      note: "Markdown prompt templates invoked as /name; subdirectories are scanned.",
    },
    {
      path: "~/.omp/agent/prompts/",
      scope: "user",
      level: "official",
      note: "Global Markdown prompt templates, separate from executable commands.",
    },
  ];
  override readonly promptTemplateSyncTarget: Harness["promptTemplateSyncTarget"] = {
    path: "~/.omp/agent/prompts/",
    scope: "user",
    level: "official",
    format: "markdown",
  };
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "--mode", "json", "{prompt}"],
    modelArgs: ["--model={model}"],
    level: "official",
    note: "Add --mode json for structured event output. --no-tools disables only OMP's bundled tools, so it cannot provide an advisor mode without tools.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.omp/agent/mcp.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
    {
      path: ".omp/mcp.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
  ];
  override readonly envOverrides: Harness["envOverrides"] = [
    {
      variable: "PI_CODING_AGENT_DIR",
      path: "~/.omp/agent",
      scope: "user",
      level: "official",
      relocates: ["config", "sessions", "instructions", "skills", "commands", "promptTemplates"],
      note: "Ignored under a named profile (OMP_PROFILE). On Linux, after omp config init-xdg, data, state and cache live under $XDG_*_HOME/omp instead.",
    },
  ];
  override readonly agentsFile = "~/.omp/agent/AGENTS.md";
  readonly detection = {
    envVars: ["OMP_PROFILE", "PI_CODING_AGENT_DIR"],
    projectMarkers: [".omp"],
  };
}
