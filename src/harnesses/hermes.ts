import { Harness } from "../harness.ts";
import type { EnvOverride, PathCandidate, Platform } from "../types.ts";

/** Hermes home per platform, the root HERMES_HOME replaces. */
const HOMES: ReadonlyArray<readonly [Platform[], string]> = [
  [["linux", "darwin"], "~/.hermes"],
  [["win32"], "%LOCALAPPDATA%/hermes"],
];

/**
 * One entry per Hermes home, tagged with its platforms, for a path inside it.
 *
 * @param path - Path relative to the home.
 * @param entry - Scope, evidence level and note shared by every platform.
 * @returns {PathCandidate[]} The POSIX and Windows entries.
 */
function inHome(
  path: string,
  entry: Readonly<Omit<PathCandidate, "path" | "platforms">>,
): PathCandidate[] {
  return HOMES.map(([platforms, root]) => ({ ...entry, path: `${root}/${path}`, platforms }));
}

export default class Hermes extends Harness {
  readonly id = "hermes";
  readonly name = "Hermes Agent";
  readonly binaries = ["hermes"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    ...inHome("config.yaml", {
      scope: "user",
      level: "official",
      note: "Model, toolsets, MCP servers under mcp_servers, shell hooks. HERMES_HOME moves the whole home.",
    }),
    ...inHome(".env", { scope: "user", level: "official", note: "API keys and secrets." }),
    ...inHome("auth.json", {
      scope: "user",
      level: "official",
      note: "OAuth logins such as Nous Portal, plus the credential pool.",
    }),
    ...inHome("plugins/", {
      scope: "user",
      level: "official",
      note: "One directory per plugin, each with a plugin.yaml and Python code.",
    }),
  ];
  readonly sessions: Harness["sessions"] = [
    ...inHome("state.db", {
      scope: "data",
      level: "official",
      note: "Every session with its full message history and an FTS5 index.",
    }),
    ...inHome("sessions/", {
      scope: "data",
      level: "official",
      note: "Gateway session JSON files and request dumps.",
    }),
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "SQLite", level: "official", note: "state.db holds sessions and messages." },
    { format: "YAML", level: "official", note: "config.yaml." },
    { format: "JSON", level: "official", note: "Gateway sessions, auth.json." },
    { format: "Markdown", level: "official", note: "SOUL.md and memories/MEMORY.md, USER.md." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: ".hermes.md",
      scope: "project",
      level: "official",
      note: "Or HERMES.md, found up to the git root. One project file type loads, and this one wins.",
    },
    {
      path: "AGENTS.override.md",
      scope: "project",
      level: "official",
      note: "Loaded instead of the AGENTS.md beside it.",
    },
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Every one from the git root down to the cwd, the deepest last. Outside git, the cwd only.",
    },
    { path: "CLAUDE.md", scope: "project", level: "official", note: "The cwd only." },
    { path: ".cursorrules", scope: "project", level: "official", note: "The cwd only." },
    ...inHome("SOUL.md", {
      scope: "user",
      level: "official",
      note: "The identity slot, always loaded. Hermes reads no AGENTS.md from its home.",
    }),
  ];
  readonly skills: Harness["skills"] = [
    {
      path: ".hermes/skills/",
      scope: "project",
      level: "official",
      note: "Loaded once hermes skills trust has trusted the repo.",
    },
    { path: ".agents/skills/", scope: "project", level: "official", note: "Same trust gate." },
    ...inHome("skills/", {
      scope: "user",
      level: "official",
      note: "skills.external_dirs in config.yaml adds more.",
    }),
  ];
  override readonly skillsSyncTarget: Harness["skillsSyncTarget"] = {
    path: "~/.hermes/skills/",
    scope: "user",
    level: "official",
    platforms: ["linux", "darwin"],
    marker: "~/.hermes/.no-bundled-skills",
    note: "The marker keeps hermes update from copying its bundled catalog into the shared folder. It still seeds hermes-agent there.",
  };
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = inHome("hooks/", {
    scope: "user",
    level: "official",
    note: "Gateway hooks, a HOOK.yaml and a handler.py each. Shell hooks live in config.yaml.",
  });
  readonly invocation: Harness["invocation"] = {
    args: ["--oneshot={prompt}", "--ignore-rules"],
    jsonArgs: [
      "chat",
      "--query={prompt}",
      "--oneshot",
      "--format",
      "stream-json",
      "--ignore-rules",
    ],
    modelArgs: ["-m", "{model}"],
    modelHint:
      "Pass model as provider:model, such as openrouter:anthropic/claude-sonnet-4. A bare id goes to the configured provider.",
    effortArgs: ["--reasoning", "{effort}"],
    level: "official",
    note: "--ignore-rules keeps AGENTS.md, SOUL.md, memory and preloaded skills out of the prompt; the tools can still read them. --ignore-user-config is left off, since it drops the configured model and a run then needs --provider and --model both. One-shot runs skip approval prompts. Every run goes through the profile's gateway, which Hermes starts on demand: a deadline or a cancel only detaches and the turn finishes anyway, and the caller's env reaches the client, not the tools. No advisor or read-only mode: -t takes no empty toolset, and tool search still reaches the rest. Checked on 0.23.3.",
  };
  override readonly envOverrides: Harness["envOverrides"] = HOMES.map(
    ([platforms, path]): EnvOverride => ({
      variable: "HERMES_HOME",
      path,
      scope: "user",
      level: "official",
      platforms,
      relocates: ["config", "sessions", "instructions", "skills", "hooks"],
    }),
  );
  readonly detection = {
    envVars: ["HERMES_AGENT"],
    projectMarkers: [".hermes", ".hermes.md", "HERMES.md"],
  };
}
