import type { Harness } from "../../../src/harness.ts";
import type { PathCandidate } from "../../../src/types.ts";

export type {
  HarnessInvocation,
  HarnessInvocationModes,
  PathCandidate,
  Platform,
} from "../../../src/types.ts";
export type Scope = PathCandidate["scope"];

/** The registry as the pages see it: the data members of `Harness`, none of its methods. */
export type HarnessRecord = Pick<
  Harness,
  | "id"
  | "name"
  | "binaries"
  | "capabilities"
  | "invocation"
  | "invocationModes"
  | "modelListing"
  | "config"
  | "sessions"
  | "persistence"
  | "instructions"
  | "skills"
  | "commands"
  | "hooks"
  | "mcpConfigs"
  | "agentsFile"
  | "detection"
>;
