import { Harness } from "../harness.ts";

/** Every tool but `read_file`. Disabled lists add up, so no agent profile undoes it. */
const READ_ONLY_FILTER = "re:^(?!read_file$).*";

/** What that filter leaves: one reader and three tools that touch nothing. */
const READ_ONLY_TOOLS = ["read_file", "run_typescript", "search_tool_functions", "wait"];

export default class Vibe extends Harness {
  readonly id = "vibe";
  readonly name = "Mistral Vibe";
  readonly binaries = ["vibe"];
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
      path: "~/.vibe/config.toml",
      scope: "user",
      level: "official",
      note: "Base directory overridable with VIBE_HOME. VIBE_<KEY> variables override single keys.",
    },
    {
      path: ".vibe/config.toml",
      scope: "project",
      level: "official",
      note: "The closest one walking up from the cwd, read only in a trusted folder.",
    },
    {
      path: "~/.vibe/trusted_folders.toml",
      scope: "user",
      level: "official",
      note: "Folders whose project config, skills and AGENTS.md Vibe loads.",
    },
    {
      path: "~/.vibe/.env",
      scope: "user",
      level: "official",
      note: "API keys and provider credentials.",
    },
    {
      path: "~/.vibe/agents/",
      scope: "user",
      level: "official",
      note: "Custom agent profiles as TOML, picked with --agent. .vibe/agents/ in a project.",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.vibe/logs/session/unified/<session-id>/",
      scope: "data",
      level: "official",
      note: "meta.json, journal/*.jsonl and chunks/ per session. session_logging.save_dir moves it.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "TOML", level: "official", note: "Config, hooks, trusted folders, agent profiles." },
    { format: "JSONL", level: "official", note: "Session journals." },
    { format: "JSON", level: "official", note: "Session metadata and content chunks." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Every one from the cwd up to the trusted root, the closest winning.",
    },
    {
      path: "~/.vibe/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".vibe/skills/", scope: "project", level: "official" },
    { path: ".agents/skills/", scope: "project", level: "official" },
    { path: "~/.vibe/skills/", scope: "user", level: "official" },
    {
      path: "~/.agents/skills/",
      scope: "user",
      level: "official",
      note: "Read by default, so the Codex skills target covers Vibe too.",
    },
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.vibe/skills/",
    scope: "user",
    level: "official",
    note: "Vibe also scans ~/.agents/skills/, so after a full sync it finds each skill twice.",
  };
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [
    { path: ".vibe/hooks.toml", scope: "project", level: "official" },
    { path: "~/.vibe/hooks.toml", scope: "user", level: "official" },
  ];
  readonly invocation: Harness["invocation"] = {
    args: ["--prompt={prompt}"],
    jsonArgs: ["--prompt={prompt}", "--output", "json"],
    readOnlyArgs: ["--prompt={prompt}", "--disabled-tools", READ_ONLY_FILTER],
    readOnlyJsonArgs: [
      "--prompt={prompt}",
      "--disabled-tools",
      READ_ONLY_FILTER,
      "--output",
      "json",
    ],
    readOnlyTools: READ_ONLY_TOOLS,
    readOnlyMinVersion: "3.1.3",
    modelArgs: ["--model", "{model}"],
    modelHint:
      "Pass model as an alias from Vibe's catalog or config.toml, such as mistral-medium-latest. An unknown one fails and names the aliases it has.",
    effortArgs: ["--thinking", "{effort}"],
    level: "official",
    note: "The prompt rides on --prompt= because -p reads one that starts with a dash as a flag. Runs use default_agent, accept-edits unless changed, and a headless run denies every call that would ask. Project AGENTS.md and .vibe/ load only in a trusted folder. Read-only runs disable every tool but read_file: bash, edits, subagents, skills, connectors and MCP tools are denied, and run_typescript stays as a sandbox without files or network. --enabled-tools does not qualify, since an agent profile's own enabled_tools replaces it. Checked on 3.1.3 against a config and an agent profile that allow everything. No advisor: with every tool disabled the model is still offered them and burns its turns on denials.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.vibe/config.toml",
      scope: "user",
      level: "official",
      format: "toml",
      key: ["mcp_servers"],
      dialect: "vibe",
      note: "One [[mcp_servers]] table per server, named inside. vibe mcp add and remove edit this file.",
    },
    {
      path: ".vibe/config.toml",
      scope: "project",
      level: "official",
      format: "toml",
      key: ["mcp_servers"],
      dialect: "vibe",
      note: "Merged over the user file by server name, in a trusted folder only.",
    },
  ];
  override readonly envOverrides: Harness["envOverrides"] = [
    {
      variable: "VIBE_HOME",
      path: "~/.vibe",
      scope: "user",
      level: "official",
      relocates: ["config", "sessions", "instructions", "skills", "hooks"],
    },
  ];
  override readonly agentsFile = "~/.vibe/AGENTS.md";
  readonly detection = {
    envVars: ["VIBE_SESSION"],
    projectMarkers: [".vibe"],
  };
}
