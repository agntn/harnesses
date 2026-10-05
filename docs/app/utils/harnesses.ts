import registry from "#harnesses-registry";
import type {
  HarnessInvocation,
  HarnessInvocationModes,
  HarnessRecord,
  PathCandidate,
  Platform,
  Scope,
} from "#shared/types/registry";

/** Icon, short label and a sentence per harness. Everything else comes from the registry. */
const PRESENTATION: Record<string, { icon: string; short: string; blurb: string }> = {
  antigravity: {
    icon: "i-simple-icons-google",
    short: "Antigravity",
    blurb: "Google's CLI, sharing ~/.gemini with Gemini CLI. Native audio and video attachments.",
  },
  claude: {
    icon: "i-simple-icons-anthropic",
    short: "Claude Code",
    blurb: "Headless -p mode, an advisor without tools, JSONL transcripts per project.",
  },
  codex: {
    icon: "i-simple-icons-openai",
    short: "Codex CLI",
    blurb: "codex exec with a native read-only sandbox. TOML config, comments kept on edit.",
  },
  cursor: {
    icon: "i-simple-icons-cursor",
    short: "Cursor",
    blurb: "cursor-agent is the CLI. Scans Claude and Codex skills directories on its own.",
  },
  freebuff: {
    icon: "i-lucide-ghost",
    short: "Freebuff",
    blurb: "Codebuff based. Knowledge files instead of rules, chats under ~/.config/manicode.",
  },
  gemini: {
    icon: "i-simple-icons-googlegemini",
    short: "Gemini CLI",
    blurb: "Headless -p mode, settings.json per scope, audio through read_file.",
  },
  "github-copilot": {
    icon: "i-simple-icons-githubcopilot",
    short: "Copilot CLI",
    blurb: "Instructions under .github, skills too. MCP servers in the VS Code dialect.",
  },
  grok: {
    icon: "i-simple-icons-x",
    short: "Grok CLI",
    blurb:
      "ACP session streams, TOML config, hooks and rules with Claude and Cursor compatibility.",
  },
  mastracode: {
    icon: "i-lucide-layers",
    short: "Mastra Code",
    blurb: "LibSQL database for threads and memory. No headless mode yet, so no invoke.",
  },
  omp: {
    icon: "i-lucide-orbit",
    short: "OMP",
    blurb: "Pi fork with profiles, sticky RULES.md and a PERSONALITY.md. No advisor mode.",
  },
  opencode: {
    icon: "i-lucide-code-xml",
    short: "OpenCode",
    blurb: "XDG paths on every platform, one SQLite database, its own MCP dialect.",
  },
  pi: {
    icon: "i-lucide-pi",
    short: "Pi",
    blurb: "Every invocation mode, native model listing with search. The reference harness here.",
  },
  "prime-agent": {
    icon: "i-lucide-cpu",
    short: "Prime Agent",
    blurb:
      "Pi fork with one Python REPL tool, flat JSONL sessions and model listing. No read-only mode.",
  },
};

export interface HarnessEntry extends HarnessRecord {
  icon: string;
  short: string;
  blurb: string;
  to: string;
}

export const LIBRARY_VERSION: string = registry.version;

export const HARNESSES: HarnessEntry[] = registry.harnesses.map((record) => {
  const presentation = PRESENTATION[record.id];
  if (!presentation) throw new Error(`No presentation for harness ${record.id}`);
  return { ...record, ...presentation, to: `/harnesses/${record.id}` };
});

export function harnessEntry(id: string): HarnessEntry | undefined {
  return HARNESSES.find((entry) => entry.id === id);
}

export const PLATFORMS: { id: Platform; label: string; home: string }[] = [
  { id: "linux", label: "Linux", home: "/home/dev" },
  { id: "darwin", label: "macOS", home: "/Users/dev" },
  { id: "win32", label: "Windows", home: "C:\\Users\\dev" },
];

export const PATH_GROUPS = [
  "config",
  "sessions",
  "instructions",
  "skills",
  "commands",
  "promptTemplates",
  "hooks",
  "temp",
] as const;
export type PathGroup = (typeof PATH_GROUPS)[number];

export interface ResolveOptions {
  homeDir: string;
  projectRoot: string;
  platform: Platform;
}

/**
 * Mirrors `resolvePathTemplate` in the library, without process.env: a `%VAR%` with no known
 * value stays as written, the same as the library does when the variable is unset, and
 * `${TMPDIR}` takes the usual Linux or Windows temp dir in place of `os.tmpdir()`.
 */
export function resolveTemplate(template: string, options: ResolveOptions): string {
  const windowsEnv: Record<string, string> = {
    PROGRAMDATA: "C:\\ProgramData",
    APPDATA: `${options.homeDir}\\AppData\\Roaming`,
    LOCALAPPDATA: `${options.homeDir}\\AppData\\Local`,
    USERPROFILE: options.homeDir,
  };
  // macOS has a per-user temp dir with no fixed shape, so the marker stays there.
  const tempDir = {
    linux: "/tmp",
    darwin: "${TMPDIR}",
    win32: `${options.homeDir}\\AppData\\Local\\Temp`,
  }[options.platform];
  return template
    .replace(/^~(?=\/|$)/u, options.homeDir)
    .replaceAll("${HOME}", options.homeDir)
    .replaceAll("${PROJECT_ROOT}", options.projectRoot)
    .replaceAll("${TMPDIR}", tempDir)
    .replaceAll(/%([^%]+)%/gu, (match: string, name: string) =>
      options.platform === "win32" ? (windowsEnv[name] ?? match) : match,
    );
}

/** Same filter and expansion as `Harness.resolve`, for one path group. */
export function resolveGroup(
  entries: readonly PathCandidate[],
  options: ResolveOptions,
): PathCandidate[] {
  return entries
    .filter((entry) => !entry.platforms || entry.platforms.includes(options.platform))
    .map((entry) => ({ ...entry, path: resolveTemplate(entry.path, options) }));
}

export type ModeKey = keyof HarnessInvocationModes;

/** Option fields of each mode, as they would sit inside `invoke(prompt, { ... })`. */
const MODE_FIELDS: Record<ModeKey, string> = {
  advisor: "",
  advisorStructured: "structured: true",
  readOnly: "readOnly: true",
  readOnlyStructured: "readOnly: true, structured: true",
  agent: "tools: true",
  agentStructured: "tools: true, structured: true",
};

const MODE_TEMPLATE: Record<ModeKey, keyof HarnessInvocation> = {
  advisor: "noToolsArgs",
  advisorStructured: "noToolsJsonArgs",
  readOnly: "readOnlyArgs",
  readOnlyStructured: "readOnlyJsonArgs",
  agent: "args",
  agentStructured: "jsonArgs",
};

const MODE_LABEL: Record<ModeKey, string> = {
  advisor: "advisor",
  advisorStructured: "advisor · json",
  readOnly: "read-only",
  readOnlyStructured: "read-only · json",
  agent: "agent",
  agentStructured: "agent · json",
};

/** The same wording the library uses in its rejection messages. */
export const MODE_DESCRIPTION: Record<ModeKey, string> = {
  advisor: "advisor without tools",
  advisorStructured: "structured (JSON) advisor without tools",
  readOnly: "read-only full agent",
  readOnlyStructured: "structured (JSON) read-only full agent",
  agent: "full agent",
  agentStructured: "structured (JSON) full agent",
};

export interface ModeSpec {
  key: ModeKey;
  label: string;
  /** Inner fields of the options object; empty for the default advisor call. */
  fields: string;
  /** Options literal for display: `{}` or `{ tools: true }`. */
  options: string;
  template: keyof HarnessInvocation;
}

export const MODES: ModeSpec[] = (Object.keys(MODE_FIELDS) as ModeKey[]).map((key) => ({
  key,
  label: MODE_LABEL[key],
  fields: MODE_FIELDS[key],
  options: MODE_FIELDS[key] ? `{ ${MODE_FIELDS[key]} }` : "{}",
  template: MODE_TEMPLATE[key],
}));

export function modeSpec(key: ModeKey): ModeSpec {
  return MODES.find((mode) => mode.key === key)!;
}

export interface BuiltCommand {
  command: string;
  args: string[];
}

/** Same word rule as `selectionError` in the library. */
const EFFORT_PATTERN = /^[a-z]+$/u;

/** Mirrors `selectionError`: a model or effort this harness can't take. Empty means unset. */
function selectionError(harness: HarnessRecord, model?: string, effort?: string): string | null {
  const invocation = harness.invocation;
  if (!invocation) return null;
  if (model && !invocation.modelArgs) {
    return `Harness ${harness.id} does not support model selection`;
  }
  if (!effort) return null;
  if (!invocation.effortArgs) return `Harness ${harness.id} does not support reasoning effort`;
  return EFFORT_PATTERN.test(effort)
    ? null
    : "Reasoning effort must be one lowercase word, such as low or high";
}

function fillArgs(args: readonly string[] | undefined, placeholder: string, value?: string) {
  return value && args ? args.map((arg) => arg.replaceAll(placeholder, value)) : [];
}

/**
 * Mirrors what `Harness.invoke` spawns: template first, model and effort arguments
 * appended, then `streamArgs` for a plain text run.
 */
export function buildCommand(
  harness: HarnessRecord,
  mode: ModeKey,
  prompt: string,
  model?: string,
  effort?: string,
): BuiltCommand | null {
  const invocation = harness.invocation;
  if (!invocation) return null;
  const command = invocation.binary ?? harness.binaries[0];
  if (!command) return null;
  if (selectionError(harness, model, effort) !== null) return null;
  const template = invocation[MODE_TEMPLATE[mode]];
  if (!Array.isArray(template)) return null;
  const args = [
    ...fillArgs(template, "{prompt}", prompt),
    ...fillArgs(invocation.modelArgs, "{model}", model),
    ...fillArgs(invocation.effortArgs, "{effort}", effort),
  ];
  if (!mode.endsWith("Structured") && invocation.streamArgs) args.push(...invocation.streamArgs);
  return { command, args };
}

/** Mirrors `Harness.invocationError` without the retry hint: why `buildCommand` returns null. */
export function invocationError(
  harness: HarnessRecord,
  mode: ModeKey,
  model?: string,
  effort?: string,
): string {
  if (!harness.invocation) return `Harness ${harness.id} has no non-interactive invocation`;
  return (
    selectionError(harness, model, effort) ??
    `Harness ${harness.id} has no ${MODE_DESCRIPTION[mode]} invocation`
  );
}

/** A shell argument: single quotes unless the value is a plain word. Empty stays visible as ''. */
export function shellArg(value: string): string {
  if (value === "") return "''";
  return /^[\w./:@=,-]+$/u.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

export function shellArgs(args: readonly string[]): string {
  return args.map(shellArg).join(" ");
}

export function shellLine(built: BuiltCommand): string {
  return `${built.command} ${shellArgs(built.args)}`;
}

/** The agent tools the MCP server, the Pi extension and the OMP extension expose. */
export const TOOLS = [
  { name: "harnesses_detect", kind: "read", does: "Installed harnesses, versions and how each one runs" },
  { name: "harnesses_info", kind: "read", does: "Full metadata for one id or a batch of up to 20" },
  { name: "harnesses_models", kind: "exec", does: "Models a harness can use right now" },
  { name: "harnesses_run", kind: "exec", does: "One prompt through another harness" },
  { name: "harnesses_mcp_list", kind: "read", does: "MCP servers across every config dialect" },
  { name: "harnesses_mcp_add", kind: "write", does: "Add or replace one MCP server" },
  { name: "harnesses_mcp_remove", kind: "write", does: "Remove one MCP server" },
  { name: "harnesses_mcp_sync", kind: "write", does: "Reset user configs to mcp.jsonc" },
  { name: "harnesses_agents_sync", kind: "write", does: "Link global instructions to one master" },
  {
    name: "harnesses_prompts_sync",
    kind: "write",
    does: "Sync canonical Markdown prompts into harness destinations",
  },
  {
    name: "harnesses_skills_sync",
    kind: "write",
    does: "Link skills directories to one shared folder",
  },
] as const;

export const SCOPE_LABEL: Record<Scope, string> = {
  user: "user",
  project: "project",
  system: "system",
  data: "data",
};

export function countPaths(harness: HarnessRecord): number {
  return PATH_GROUPS.reduce((sum, group) => sum + harness[group].length, 0);
}

export function capabilityList(harness: HarnessRecord): string[] {
  return Object.entries(harness.capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key);
}

export function modeList(harness: HarnessRecord): ModeKey[] {
  return MODES.filter((mode) => harness.invocationModes[mode.key]).map((mode) => mode.key);
}

/** Evidence levels in the order the registry ranks them, strongest first. */
export const LEVELS = ["official", "community", "inferred"] as const;
export type Level = (typeof LEVELS)[number];

/** Every path of a harness, all groups together. */
export function allPaths(harness: HarnessRecord): PathCandidate[] {
  return PATH_GROUPS.flatMap((group) => harness[group]);
}

/** How many paths of the harnesses sit at each evidence level. */
export function levelCounts(harnesses: readonly HarnessRecord[]): Record<Level, number> {
  const counts: Record<Level, number> = { official: 0, community: 0, inferred: 0 };
  for (const entry of harnesses.flatMap(allPaths)) counts[entry.level] += 1;
  return counts;
}

/** The resolve options the landing uses: templates stay readable with `~` and `.` as the roots. */
export const LANDING_RESOLVE: ResolveOptions = {
  platform: "linux",
  homeDir: "~",
  projectRoot: ".",
};

/** The user-scope MCP config `syncMcpServers` rewrites, or the first one the harness has. */
export function userMcpConfig(harness: HarnessRecord) {
  return harness.mcpConfigs.find((file) => file.scope === "user") ?? harness.mcpConfigs[0];
}
