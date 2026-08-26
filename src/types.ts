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
  | "pi";
export type EvidenceLevel = "official" | "community" | "inferred";
export type Platform = "linux" | "darwin" | "win32";

export interface PathCandidate {
  path: string;
  scope: "user" | "project" | "system" | "data";
  level: EvidenceLevel;
  platforms?: Platform[];
  note?: string;
}

export interface StorageDescriptor {
  format: string;
  level: EvidenceLevel;
  note?: string;
}

export interface HarnessCapabilities {
  mcp: boolean;
  vision: boolean;
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
  level: EvidenceLevel;
  note?: string;
}

/** Invocation modes a harness supports without fallback or prompt-only restrictions. */
export interface HarnessInvocationModes {
  advisor: boolean;
  advisorStructured: boolean;
  agent: boolean;
  agentStructured: boolean;
}

export interface InvokeOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Enable the spawned harness's tools; defaults to advisor without tools mode. */
  tools?: boolean;
  /** Kill the harness after this many milliseconds; unset means no timeout. */
  timeoutMs?: number;
  /** Use the harness's structured (JSON) output mode instead of plain text. */
  structured?: boolean;
}

export interface InvokeResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  /** Process exit code; null when the run hit `timeoutMs` and was killed. */
  exitCode: number | null;
  timedOut: boolean;
}

/** Normalized MCP server entry, shared across every harness dialect. */
export interface McpServerConfig {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
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
  /** Shape of individual entries; "standard" is the {command, args, env, url} family. */
  dialect: "standard" | "antigravity" | "opencode" | "vscode";
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
  hooks: PathCandidate[];
}
