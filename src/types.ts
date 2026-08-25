import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const pkg = _require("../package.json") as { version: string };

export const version: string = pkg.version;

export type HarnessId =
  | "codex"
  | "gemini"
  | "grok"
  | "claude"
  | "opencode"
  | "cursor"
  | "github-copilot"
  | "mastracode"
  | "omp";
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
