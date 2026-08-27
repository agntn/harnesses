import pkg from "../package.json" with { type: "json" };

export const version: string = pkg.version;

export type HarnessId =
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
  /** Argument template; every "{prompt}" is replaced with the prompt text. */
  args: string[];
  /**
   * Argument template for the harness's structured (JSON) output mode; absent
   * when the harness has no such mode. Same "{prompt}" substitution as `args`.
   */
  jsonArgs?: string[];
  level: EvidenceLevel;
  note?: string;
}

export interface InvokeOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Kill the harness after this many milliseconds; unset means no timeout. */
  timeoutMs?: number;
  /** Use the harness's structured (JSON) output mode instead of plain text. */
  structured?: boolean;
  /** Optional AbortSignal to cancel execution before or during the run. */
  signal?: AbortSignal;
}

export interface InvokeResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  /** Process exit code; null when the run hit `timeoutMs` or was aborted. */
  exitCode: number | null;
  timedOut: boolean;
  aborted?: boolean;
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
