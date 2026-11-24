import { defineTool, Type } from "@agntn/tools";
import type { Harness } from "../harness.ts";
import { harnessId, resolveHarness } from "./harness-id.ts";
import { entry, header, print, printed, s, sanitize, section, wantsJson } from "./output.ts";

/**
 * Read-only Grok loses the network on Linux, so info says it right under the modes.
 *
 * @param network - The harness's answer for this platform.
 * @returns {string} One coloured line, dim when nobody checked.
 */
function readOnlyNetworkLine(network: boolean | null): string {
  if (network === null) return s.dim("readOnly network: unknown");
  return network
    ? s.green("readOnly network: kept")
    : s.red("readOnly network: cut, MCP servers included");
}

/**
 * Read-only Pi keeps four tools and nothing else, so info names them before a run asks for more.
 *
 * @param tools - The harness's read-only allowlist.
 * @returns {string} One line, dim when a sandbox decides instead of a list.
 */
function readOnlyToolsLine(tools: readonly string[] | null): string {
  if (tools === null) return s.dim("readOnly tools: no allowlist");
  return s.white(`readOnly tools: only ${sanitize(tools.join(", "))}, no extension or MCP tools`);
}

/** The model part of `harnesses info`: three switches and the hint, when the recipe has one. */
interface ModelSummary {
  features: Record<"listing" | "selection" | "effort", boolean>;
  hint: string | null;
}

/**
 * Reads what info says about models in one place, so the command body stays flat.
 *
 * @param harness - The harness to describe.
 * @returns {ModelSummary} Its model switches and hint.
 */
function modelSummary(harness: Harness): ModelSummary {
  return {
    features: {
      listing: harness.modelListing !== null,
      selection: harness.invocation?.modelArgs !== undefined,
      effort: harness.invocation?.effortArgs !== undefined,
    },
    hint: harness.invocation?.modelHint ?? null,
  };
}

/**
 * Whether a run can skip extension discovery, as `--no-extensions` asks.
 *
 * @param harness - The harness to ask.
 * @returns {boolean} True when its recipe carries `noExtensionsArgs`.
 */
function extensionsOptional(harness: Harness): boolean {
  return harness.invocation?.noExtensionsArgs !== undefined;
}

/**
 * Which session options a run takes, as `--resume` and `--session-id` ask.
 *
 * @param harness - The harness to ask.
 * @returns {Record<"resume" | "sessionId", boolean>} One switch per option.
 */
function sessionSwitches(harness: Harness): Record<"resume" | "sessionId", boolean> {
  return {
    resume: harness.invocation?.resumeArgs !== undefined,
    sessionId: harness.invocation?.sessionIdArgs !== undefined,
  };
}

/**
 * @param harness - The harness to describe.
 * @returns {object} Everything `info --json` prints.
 */
function metadata(harness: Harness) {
  const models = modelSummary(harness);
  return {
    id: harness.id,
    name: harness.name,
    binaries: harness.binaries,
    capabilities: harness.capabilities,
    invocationModes: harness.invocationModes,
    readOnlyNetwork: harness.readOnlyNetwork(),
    readOnlyTools: harness.readOnlyTools(),
    modelListing: models.features.listing,
    modelHint: models.hint,
    modelSelection: models.features.selection,
    effortSelection: models.features.effort,
    extensionsOptional: extensionsOptional(harness),
    sessionResume: sessionSwitches(harness).resume,
    sessionIdSelection: sessionSwitches(harness).sessionId,
    config: harness.config,
    sessions: harness.sessions,
    instructions: harness.instructions,
    skills: harness.skills,
    commands: harness.commands,
    promptTemplates: harness.promptTemplates,
    hooks: harness.hooks,
    temp: harness.temp,
    envOverrides: harness.envOverrides,
    persistence: harness.persistence,
    detection: harness.detection,
  };
}

/**
 * @param switches - Name and state of each switch.
 * @returns {string} Green for on, dim for off.
 */
function switchLine(switches: Readonly<Record<string, boolean>>): string {
  return Object.entries(switches)
    .map(([k, v]) => (v ? s.green(k) : s.dim(k)))
    .join(s.dim("  ·  "));
}

/**
 * @param title - Section title.
 * @param entries - Path candidates of one category.
 */
function printPaths(
  title: string,
  entries: readonly {
    readonly path: string;
    readonly scope: string;
    readonly platforms?: readonly string[];
    readonly note?: string;
  }[],
): void {
  if (!entries.length) return;
  print(section(title));
  for (const e of entries) {
    const tags = [s.dim(e.scope)];
    if (e.platforms) tags.push(s.dim(e.platforms.join(", ")));
    print(entry(`${s.hi(e.path)}  ${tags.join(s.dim(" · "))}`));
    if (e.note) print(entry(`${s.dim(`  ${e.note}`)}`));
  }
}

/**
 * Prints the modes, the model switches and the read-only caveats.
 *
 * @param harness - The harness to describe.
 */
function printModes(harness: Harness): void {
  print(section("Capabilities"));
  print(entry(switchLine({ ...harness.capabilities })));
  print(section("Invocation modes"));
  print(entry(switchLine({ ...harness.invocationModes })));
  print(entry(readOnlyNetworkLine(harness.readOnlyNetwork())));
  print(entry(readOnlyToolsLine(harness.readOnlyTools())));
  if (extensionsOptional(harness)) {
    print(entry(s.white("extensions: optional, --no-extensions skips them")));
  }
  print(entry(`${s.dim("session:")} ${switchLine(sessionSwitches(harness))}`));
  const models = modelSummary(harness);
  print(section("Models"));
  print(entry(switchLine(models.features)));
  if (models.hint !== null) print(entry(s.dim(sanitize(models.hint))));
}

/**
 * @param harness - The harness to describe.
 */
function printInfo(harness: Harness): void {
  print(header(`${harness.name}  ${s.dim(harness.id)}`));
  print(section("Binaries"));
  for (const b of harness.binaries) print(entry(s.white(b)));
  printModes(harness);
  printPaths("Config", harness.config);
  printPaths("Sessions", harness.sessions);
  printPaths("Instructions", harness.instructions);
  printPaths("Skills", harness.skills);
  printPaths("Commands", harness.commands);
  printPaths("Prompt templates", harness.promptTemplates);
  printPaths("Hooks", harness.hooks);
  printPaths("Temp", harness.temp);
  printPaths(
    "Env overrides",
    harness.envOverrides.map((e) => ({
      ...e,
      path: `${e.variable}  ${s.dim(`${e.path} → ${e.relocates.join(", ")}`)}`,
    })),
  );
  if (harness.persistence.length) {
    print(section("Persistence"));
    for (const e of harness.persistence) {
      const note = e.note ? `  ${s.dim(e.note)}` : "";
      print(entry(`${s.white(e.format)}${note}`));
    }
  }
  print();
}

export default defineTool({
  name: "harnesses_info",
  title: "Show Harness",
  description: "Show metadata for a harness",
  effect: "read",
  input: Type.Object({ id: harnessId }, { additionalProperties: false }),
  cli: { positional: ["id"], plain: ["id"] },
  async execute({ id }, { host }) {
    const { harness, refusal } = await resolveHarness(id);
    if (refusal) return refusal;
    const data = metadata(harness);
    if (!wantsJson(host)) printInfo(harness);
    return printed(data);
  },
});
