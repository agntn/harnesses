/**
 * Tool executors behind the agent extensions.
 *
 * Each executor returns the text a caller reads plus the structured details a
 * harness can attach to the call. The text is TOON-encoded so the model sees
 * the same compact shape the CLI's --toon flag prints.
 */
import { encode as toToon } from "@toon-format/toon";
import { getAllHarnesses, getHarness, listHarnesses } from "./registry.ts";
import type {
  HarnessCapabilities,
  HarnessDetection,
  HarnessId,
  PathCandidate,
  ResolvedPaths,
  StorageDescriptor,
} from "./types.ts";

/** Text for the model plus details for the harness, shared by every tool surface. */
export interface ToolResult<Details> {
  content: Array<{ type: "text"; text: string }>;
  details: Details;
  /** Set when the tool could not answer. */
  isError?: boolean;
}

/** Install state of one harness on this machine. */
export interface HarnessStatus {
  id: HarnessId;
  name: string;
  installed: boolean;
  version: string | null;
}

/** Every registered harness with its install state, as scanned by {@link detectHarnesses}. */
export interface HarnessListing {
  harnesses: HarnessStatus[];
}

/** Full metadata for one harness, including paths resolved for this platform. */
export interface HarnessMetadata {
  id: HarnessId;
  name: string;
  binaries: string[];
  capabilities: HarnessCapabilities;
  config: PathCandidate[];
  sessions: PathCandidate[];
  instructions: PathCandidate[];
  skills: PathCandidate[];
  commands: PathCandidate[];
  hooks: PathCandidate[];
  persistence: StorageDescriptor[];
  detection: HarnessDetection;
  resolved: ResolvedPaths;
}

/** Returned when the requested harness id is not registered. */
export interface UnknownHarness {
  error: string;
  known: HarnessId[];
}

function text(data: unknown): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text: toToon(data) }];
}

/** Scans every registered harness for its binaries and version. */
export function detectHarnesses(): ToolResult<HarnessListing> {
  const details: HarnessListing = {
    harnesses: getAllHarnesses().map((harness) => {
      const installed = harness.isInstalled();
      return {
        id: harness.id,
        name: harness.name,
        installed,
        version: installed ? harness.version : null,
      };
    }),
  };

  return { content: text(details), details };
}

/** Full metadata for one harness, with paths resolved for the current platform. */
export function harnessInfo(id: string): ToolResult<HarnessMetadata | UnknownHarness> {
  const known = listHarnesses();

  if (!(known as string[]).includes(id)) {
    const details: UnknownHarness = { error: `Unknown harness: ${id}`, known };
    return { content: text(details), details, isError: true };
  }

  const harness = getHarness(id as HarnessId);
  const details: HarnessMetadata = {
    id: harness.id,
    name: harness.name,
    binaries: harness.binaries,
    capabilities: harness.capabilities,
    config: harness.config,
    sessions: harness.sessions,
    instructions: harness.instructions,
    skills: harness.skills,
    commands: harness.commands,
    hooks: harness.hooks,
    persistence: harness.persistence,
    detection: harness.detection,
    resolved: harness.resolve(),
  };

  return { content: text(details), details };
}
