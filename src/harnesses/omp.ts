import { Harness } from "../harness.ts";

export default class Omp extends Harness {
  readonly id = "omp";
  readonly name = "OMP (oh-my-pi)";
  readonly binaries = ["omp"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.omp/agent/config.yml",
      scope: "user",
      level: "official",
      note: "Agent dir overridable with PI_CODING_AGENT_DIR; profiles use ~/.omp/profiles/<name>/agent.",
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
  readonly commands: Harness["commands"] = [
    { path: ".omp/commands/", scope: "project", level: "official" },
    {
      path: "~/.omp/agent/commands/",
      scope: "user",
      level: "official",
      note: "Global user-level prompt commands.",
    },
  ];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    level: "official",
    note: "Add --mode json for structured event output.",
  };
  readonly detection = {
    envVars: ["OMP_PROFILE", "PI_CODING_AGENT_DIR"],
    projectMarkers: [".omp"],
  };
}
