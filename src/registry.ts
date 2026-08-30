import type { Harness, HarnessConstructor } from "./harness.ts";
import { harnesses } from "./harnesses/index.ts";
import type { HarnessId } from "./types.ts";

let registry: Map<HarnessId, Harness> | undefined;

function getRegistry(): Map<HarnessId, Harness> {
  if (!registry) {
    registry = new Map();
    for (const HarnessClass of harnesses) {
      const harness = new HarnessClass();
      registry.set(harness.id, harness);
    }
  }
  return registry;
}

export function registerHarness(HarnessClass: HarnessConstructor): Harness {
  const harness = new HarnessClass();
  getRegistry().set(harness.id, harness);
  return harness;
}

export function getHarness(id: HarnessId): Harness {
  const harness = getRegistry().get(id);
  if (!harness) throw new Error(`Unknown harness: ${id}`);
  return harness;
}

export function listHarnesses(): HarnessId[] {
  return [...getRegistry().keys()];
}

export function isHarnessId(id: string): id is HarnessId {
  return getRegistry().has(id as HarnessId);
}

export function getAllHarnesses(): Harness[] {
  return [...getRegistry().values()];
}

/**
 * Detect the active agent from environment variables.
 * Returns the first match since env detection is unambiguous.
 *
 * @returns {Harness | null} The detected harness, or null when none matches.
 */
export function detectHarnessFromEnv(): Harness | null {
  for (const harness of getRegistry().values()) {
    if (harness.detectEnv()) return harness;
  }
  return null;
}

/**
 * Detect which agents have project-level markers in the given directory.
 * Returns all matches (multiple agents can be configured in the same project).
 *
 * @param cwd - Directory to inspect; defaults to the current working directory.
 * @returns {Harness[]} Every harness whose project markers match.
 */
export function detectProjectHarnesses(cwd?: string): Harness[] {
  return [...getRegistry().values()].filter((harness) => harness.detectProject(cwd));
}

/**
 * Detect the most likely active agent. Priority:
 * 1. Env vars (running inside agent = unambiguous)
 * 2. Single project-level match
 * 3. null if ambiguous or no match
 *
 * @param cwd - Directory to inspect for project markers.
 * @returns {Harness | null} The unambiguous active harness, or null.
 */
export function detectHarness(cwd?: string): Harness | null {
  const fromEnv = detectHarnessFromEnv();
  if (fromEnv) return fromEnv;

  let match: Harness | null = null;
  for (const harness of getRegistry().values()) {
    if (harness.detectProject(cwd)) {
      if (match) return null;
      match = harness;
    }
  }
  return match;
}
