import { defineTool, Type } from "@agntn/tools";
import type { AvailableModel } from "../types.ts";
import type { ModelsOutcome } from "../tool-operations.ts";
import { harnessId, resolveHarness } from "./harness-id.ts";
import { entry, header, print, printed, refusal, s, sanitize, wantsJson } from "./output.ts";

/**
 * @param model - One listed model.
 * @returns {string} Name, default mark, limits and features, dot separated.
 */
function modelDescription(model: Readonly<AvailableModel>): string {
  const parts: string[] = [];
  if (model.name !== undefined) parts.push(model.name);
  if (model.default) parts.push("default");
  if (model.contextWindow !== undefined) parts.push(`${model.contextWindow} context`);
  if (model.maxOutputTokens !== undefined) parts.push(`${model.maxOutputTokens} max-out`);
  const features: string[] = [];
  if (model.thinking) features.push("thinking");
  if (model.images) features.push("images");
  if (features.length > 0) parts.push(features.join(", "));
  return parts.join(" · ");
}

export default defineTool({
  name: "harnesses_models",
  title: "List Harness Models",
  description: "List models available to a harness",
  effect: "exec",
  openWorld: true,
  input: Type.Object(
    {
      id: harnessId,
      search: Type.Optional(
        Type.String({ description: "Optional native model search filter", minLength: 1 }),
      ),
      cwd: Type.Optional(
        Type.String({
          description: "Working directory used while loading harness configuration",
          minLength: 1,
        }),
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Wall-clock budget in seconds", exclusiveMinimum: 0 }),
      ),
    },
    { additionalProperties: false },
  ),
  cli: { positional: ["id", "search"], plain: ["id"] },
  async execute({ id, search, cwd, timeout }, { host, signal }) {
    const { harness, refusal: unknown } = await resolveHarness(id);
    if (unknown) return unknown;
    const { listHarnessModels } = await import("../tool-operations.ts");
    const result = await listHarnessModels(id, { search, cwd, timeoutSeconds: timeout, signal });
    if (result.isError || !("models" in result.details)) {
      return refusal("error" in result.details ? result.details.error : "Failed to list models");
    }
    const details: ModelsOutcome = result.details;
    if (wantsJson(host)) return printed(details);

    print(header(`${details.id} models`));
    print();
    for (const model of details.models) {
      const selector = s.hi(sanitize(harness.modelSelector(model)));
      print(entry(`${selector}  ${s.dim(sanitize(modelDescription(model)))}`));
    }
    if (details.models.length === 0) print(entry(s.dim("No models found")));
    print();
    return printed(details);
  },
});
