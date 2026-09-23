import pkg from "../package.json" with { type: "json" };

export const version: string = pkg.version;

export type HarnessId =
  | "antigravity"
  | "codex"
  | "gemini"
  | "grok"
  | "claude"
  | "opencode"
  | "cursor"
  | "freebuff"
  | "github-copilot"
  | "mastracode"
  | "omp"
  | "pi"
  | "prime-agent";
export type EvidenceLevel = "official" | "community" | "inferred";
export type Platform = "linux" | "darwin" | "win32";

export interface PathCandidate {
  path: string;
  scope: "user" | "project" | "system" | "data";
  level: EvidenceLevel;
  platforms?: Platform[];
  note?: string;
}

/** One stable user-scope destination used by prompt template synchronization. */
export interface PromptTemplateSyncTarget extends PathCandidate {
  scope: "user";
  format: "markdown" | "gemini-toml";
}

export interface StorageDescriptor {
  format: string;
  level: EvidenceLevel;
  note?: string;
}

export interface HarnessCapabilities {
  mcp: boolean;
  vision: boolean;
  /** Audio reaches the model without conversion or MCP. */
  audio: boolean;
  /** Video reaches the model without conversion or MCP. */
  video: boolean;
  tools: boolean;
  streaming: boolean;
}

/** How to run one prompt through the harness non-interactively. */
export interface HarnessInvocation {
  /** Binary to spawn; defaults to the harness's first `binaries` entry. */
  binary?: string;
  /** Full agent argument template; every "{prompt}" is replaced with the prompt text. */
  args: string[];
  /** Structured full agent argument template. */
  jsonArgs?: string[];
  /** Advisor argument template without tools; absent when the CLI cannot disable tools. */
  noToolsArgs?: string[];
  /** Structured advisor argument template without tools. */
  noToolsJsonArgs?: string[];
  /** Agent argument template whose native sandbox enforces read-only tool access. */
  readOnlyArgs?: string[];
  /** Structured agent argument template with read-only tool access. */
  readOnlyJsonArgs?: string[];
  /** Lowest CLI version whose read-only enforcement was verified; older or unknown versions reject read-only runs. */
  readOnlyMinVersion?: string;
  /** Arguments appended when a model is selected; every "{model}" is replaced. */
  modelArgs?: string[];
  /**
   * Arguments appended to a plain text run so a CLI that holds its answer until
   * the end reports it as events instead; `invoke` folds them back into that text,
   * so a stopped run keeps what the model had already written.
   */
  streamArgs?: string[];
  level: EvidenceLevel;
  note?: string;
}

/** Invocation modes a harness supports without fallback or prompt-only restrictions. */
export interface HarnessInvocationModes {
  advisor: boolean;
  advisorStructured: boolean;
  readOnly: boolean;
  readOnlyStructured: boolean;
  agent: boolean;
  agentStructured: boolean;
}

/** How to ask one harness CLI for the models currently available to it. */
export interface HarnessModelListing {
  /** Arguments used when no search filter is supplied. */
  args: string[];
  /**
   * Optional argument template for a native search filter; every "{search}" is replaced.
   * Without it, a search runs `args` and keeps the ids containing the filter, ignoring case.
   */
  searchArgs?: string[];
  level: EvidenceLevel;
  note?: string;
}

/** One model normalized from a harness's native model-listing output. */
export interface AvailableModel {
  provider: string;
  id: string;
  /** Absent when the native listing prints only ids, like Grok's. */
  contextWindow?: number;
  maxOutputTokens?: number;
  thinking?: boolean;
  images?: boolean;
  /** Set on the model the harness picks when no model is given, when the listing marks one. */
  default?: boolean;
}

/** Options for querying the models available to one harness. */
export interface ListModelsOptions {
  search?: string;
  cwd?: string;
  env?: Record<string, string>;
  /** Milliseconds before cleanup starts. Unset or 0 disables the deadline. */
  timeoutMs?: number;
  /** Cancel with the same process cleanup as a timeout. */
  signal?: AbortSignal;
}

export interface InvokeOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Harness-native model id or selector. */
  model?: string;
  /** Enable the spawned harness's tools; defaults to advisor without tools mode. */
  tools?: boolean;
  /** Require native enforcement of read-only tool access. Implies `tools: true` when `tools` is omitted; `tools: false` rejects the run. */
  readOnly?: boolean;
  /** Milliseconds before cleanup starts. Unset or 0 disables the deadline. */
  timeoutMs?: number;
  /** Cancel with the same process cleanup as a timeout. */
  signal?: AbortSignal;
  /** Use the harness's structured (JSON) output mode instead of plain text. */
  structured?: boolean;
}

export interface InvokeResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  /** Process exit code; null when terminated by a signal, timeout, or cancellation. */
  exitCode: number | null;
  timedOut: boolean;
  /** True when caller cancellation wins over the deadline or completion. */
  aborted: boolean;
  /** Milliseconds without output on either stream before a deadline or cancellation stopped the process. */
  idleMs?: number;
}

/** Result of one native model-listing command. */
export interface ListModelsResult extends InvokeResult {
  /** Empty on a successful no-match response or when the command itself failed. */
  models: AvailableModel[];
}

/** Normalized MCP server entry, shared across every harness dialect. */
export interface McpServerConfig {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  /**
   * Environment for stdio servers. A value that is exactly "${NAME}" refers to
   * the variable NAME of the harness environment: dialects with native
   * references keep it, the others resolve it when the entry is written.
   */
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** Present only when the harness tracks an on/off state per server. */
  enabled?: boolean;
}

/** How one harness config file stores its MCP servers. */
export interface McpConfigFile extends PathCandidate {
  format: "json" | "toml";
  /** Object path to the server map inside the file, e.g. ["mcpServers"]. */
  key: string[];
  /**
   * Shape of individual entries; "standard" is the {command, args, env, url}
   * family, "prime" is that family with env values as {"env": "NAME"} references
   * and "mastracode" is that family read by its keys alone, type ignored.
   */
  dialect: "standard" | "antigravity" | "mastracode" | "opencode" | "prime" | "vscode";
}

export interface HarnessDetection {
  /** Environment variables that indicate running inside this agent. */
  envVars: string[];
  /** Project-level files or directories whose presence indicates this agent. */
  projectMarkers: string[];
}

export interface ResolveOptions {
  homeDir?: string;
  projectRoot?: string;
  platform?: Platform;
}

export interface ResolvedPaths {
  config: PathCandidate[];
  sessions: PathCandidate[];
  instructions: PathCandidate[];
  skills: PathCandidate[];
  commands: PathCandidate[];
  promptTemplates: PathCandidate[];
  promptTemplateSyncTarget: PromptTemplateSyncTarget | null;
  hooks: PathCandidate[];
}
