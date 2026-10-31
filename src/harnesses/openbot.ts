import { Harness } from "../harness.ts";
import type { PathCandidate, Platform } from "../types.ts";

/** Electron's userData: the app is named OpenBot, so it all lands in `<appData>/OpenBot`. */
const USER_DATA: ReadonlyArray<readonly [Platform, string]> = [
  ["linux", "~/.config/OpenBot"],
  ["darwin", "~/Library/Application Support/OpenBot"],
  ["win32", "%APPDATA%/OpenBot"],
];

/**
 * One entry per userData root, tagged with its platform, for a path inside it.
 *
 * @param path - Path relative to userData; empty for the directory itself.
 * @param entry - Scope, evidence level and note shared by every platform.
 * @returns {PathCandidate[]} The entries for Linux, macOS and Windows.
 */
function inUserData(
  path: string,
  entry: Readonly<Omit<PathCandidate, "path" | "platforms">>,
): PathCandidate[] {
  return USER_DATA.map(([platform, root]) => ({
    ...entry,
    path: `${root}/${path}`,
    platforms: [platform],
  }));
}

export default class OpenBot extends Harness {
  readonly id = "openbot";
  readonly name = "OpenBot";
  /** Only the Nix package puts it on PATH. The Linux release is a loose AppImage. */
  readonly binaries = ["openbot"];

  /**
   * No `--version` switch here, so the inherited probe would open the whole app.
   *
   * @returns {string | null} Always null.
   */
  override get version(): string | null {
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
  readonly config: Harness["config"] = inUserData("", {
    scope: "user",
    level: "official",
    note: "Settings sit in openbot-*-v1.json files here. --user-data-dir moves the whole directory.",
  });
  readonly sessions: Harness["sessions"] = inUserData("openbot.db", {
    scope: "data",
    level: "official",
    note: "Agents, conversations, routines and MCP servers, all in one SQLite database.",
  });
  readonly persistence: Harness["persistence"] = [
    {
      format: "SQLite",
      level: "official",
      note: "openbot.db is the source of truth: an append-only event log plus projection tables.",
    },
    { format: "JSON", level: "official", note: "Small preference and state files beside it." },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "~/OpenBot/Agents/<agent-id>/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Each agent's own rules, edited from its settings. An older workspace keeps CLAUDE.md.",
    },
  ];
  readonly skills: Harness["skills"] = [
    {
      path: "~/.agents/skills/",
      scope: "user",
      level: "official",
      note: "The one folder it reads for your own skills, minus any the provider CLI already loads. Codex's skills sync links it.",
    },
    ...inUserData("local-skills/", {
      scope: "data",
      level: "official",
      note: "Skills made inside the app, one immutable directory per revision.",
    }),
  ];
  readonly commands: Harness["commands"] = [];
  readonly hooks: Harness["hooks"] = [];
  override readonly envOverrides: Harness["envOverrides"] = [
    {
      variable: "XDG_CONFIG_HOME",
      path: "~/.config",
      scope: "user",
      level: "official",
      platforms: ["linux"],
      relocates: ["config", "sessions", "skills"],
      note: "Electron's appData on Linux. --user-data-dir still wins.",
    },
  ];
  readonly invocation: Harness["invocation"] = null;
  readonly detection = {
    envVars: ["OPENBOT_AGENT_PROCESS"],
    projectMarkers: [],
  };
}
