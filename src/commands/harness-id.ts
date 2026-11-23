import { Type } from "@agntn/tools";
import type { Harness } from "../harness.ts";
import { refusal } from "./output.ts";

/** A plain string, so an unknown id gets the list of known ones instead of a pattern error. */
export const harnessId = Type.String({ description: "Harness id", minLength: 1 });

/** The harness behind an id, or the refusal that names the known ones. */
export type Resolved =
  | { readonly harness: Harness; readonly refusal?: undefined }
  | { readonly harness?: undefined; readonly refusal: ReturnType<typeof refusal> };

/**
 * @param id - Id from the command line.
 * @returns {Promise<Resolved>} The harness, or the refusal naming the known ids.
 */
export async function resolveHarness(id: string): Promise<Resolved> {
  const { getHarness, isHarnessId, listHarnesses } = await import("../registry.ts");
  if (isHarnessId(id)) return { harness: getHarness(id) };
  return { refusal: refusal(`Unknown harness: ${id}\nKnown: ${listHarnesses().join(", ")}`) };
}
