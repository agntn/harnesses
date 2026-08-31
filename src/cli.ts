#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { encode as toToon } from "@toon-format/toon";
import { version, type AvailableModel, type InvokeResult } from "./types.ts";
import { getAllHarnesses, getHarness, isHarnessId, listHarnesses } from "./registry.ts";
import { listHarnessModels, type ModelsOutcome, type RunFailure } from "./tool-operations.ts";

const s = {
  cyan: (t: string) => `\x1B[36m${t}\x1B[0m`,
  hi: (t: string) => `\x1B[96m${t}\x1B[0m`,
  green: (t: string) => `\x1B[32m${t}\x1B[0m`,
  red: (t: string) => `\x1B[31m${t}\x1B[0m`,
  dim: (t: string) => `\x1B[90m${t}\x1B[0m`,
  bold: (t: string) => `\x1B[1m${t}\x1B[0m`,
  white: (t: string) => `\x1B[97m${t}\x1B[0m`,
};

function header(title: string) {
  return `\n  ${s.bold(s.cyan(title))}`;
}

function section(title: string) {
  return `\n  ${s.cyan("▸")} ${s.white(title)}`;
}

function entry(content: string) {
  return `    ${content}`;
}

function renderPathSection(
  title: string,
  entries: readonly {
    readonly path: string;
    readonly scope: string;
    readonly platforms?: readonly string[];
    readonly note?: string;
  }[],
) {
  if (!entries.length) return;
  consola.log(section(title));
  for (const e of entries) {
    const tags = [s.dim(e.scope)];
    if (e.platforms) tags.push(s.dim(e.platforms.join(", ")));
    consola.log(entry(`${s.hi(e.path)}  ${tags.join(s.dim(" · "))}`));
    if (e.note) consola.log(entry(`${s.dim(`  ${e.note}`)}`));
  }
}

const formatArgs = {
  json: { type: "boolean" as const, description: "Output as JSON" },
  toon: { type: "boolean" as const, description: "Output as TOON" },
};

const harnessArg = {
  type: "positional" as const,
  description: "Harness id",
  required: true,
};

function emit(data: unknown, args: Readonly<{ json?: boolean; toon?: boolean }>) {
  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
    return true;
  }
  if (args.toon) {
    console.log(toToon(data));
    return true;
  }
  return false;
}

function resolveHarness(id: string): ReturnType<typeof getHarness> {
  if (!isHarnessId(id)) {
    consola.error(`Unknown harness: ${id}\nKnown: ${listHarnesses().join(", ")}`);
    process.exit(1);
  }
  return getHarness(id);
}

function renderResolvedPathSection(
  title: string,
  entries: readonly { readonly path: string }[],
): void {
  if (entries.length === 0) return;
  consola.log(section(title));
  for (const item of entries) consola.log(entry(s.hi(item.path)));
}

function parsePositiveTimeout(raw: string | undefined): number | null | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function modelFailureMessage(details: ModelsOutcome | RunFailure): string {
  return "error" in details ? details.error : "Failed to list models";
}

function modelDescription(model: Readonly<AvailableModel>): string {
  const features: string[] = [];
  if (model.thinking) features.push("thinking");
  if (model.images) features.push("images");
  const suffix = features.length > 0 ? ` · ${features.join(", ")}` : "";
  return `${model.contextWindow} context · ${model.maxOutputTokens} max-out${suffix}`;
}

function renderModels(details: ModelsOutcome): void {
  consola.log(header(`${details.id} models`));
  consola.log("");
  for (const model of details.models) {
    consola.log(
      entry(`${s.hi(`${model.provider}/${model.id}`)}  ${s.dim(modelDescription(model))}`),
    );
  }
  if (details.models.length === 0) consola.log(entry(s.dim("No models found")));
  consola.log("");
}

function finishInvocation(result: InvokeResult, timeoutSeconds: number | undefined): never {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.timedOut) {
    consola.error(`Timed out after ${timeoutSeconds}s`);
    process.exit(124);
  }
  process.exit(result.exitCode ?? 1);
}

const list = defineCommand({
  meta: { description: "List all known harnesses" },
  args: { ...formatArgs },
  run({ args }) {
    const harnesses = getAllHarnesses();
    const data = harnesses.map((harness) => ({ id: harness.id, name: harness.name }));

    if (emit(data, args)) return;

    consola.log(header("Harnesses"));
    consola.log("");
    const maxId = Math.max(...data.map((r) => r.id.length));
    for (const { id, name } of data) {
      consola.log(entry(`${s.hi(id.padEnd(maxId))}  ${name}`));
    }
    consola.log("");
  },
});

const detect = defineCommand({
  meta: { description: "Detect installed harnesses and versions" },
  args: { ...formatArgs },
  run({ args }) {
    const harnesses = getAllHarnesses();
    const results = harnesses.map((harness) => {
      const installed = harness.isInstalled();
      const v = installed ? harness.version : null;
      return { id: harness.id, name: harness.name, installed, version: v };
    });

    if (emit(results, args)) return;

    consola.log(header("System Scan"));
    consola.log("");
    const maxId = Math.max(...results.map((r) => r.id.length));
    for (const r of results) {
      if (r.installed) {
        const ver = r.version ? `  ${s.dim(`v${r.version}`)}` : "";
        consola.log(entry(`${s.green("●")} ${s.hi(r.id.padEnd(maxId))}  ${r.name}${ver}`));
      } else {
        consola.log(entry(`${s.dim("○")} ${s.dim(r.id.padEnd(maxId))}  ${s.dim(r.name)}`));
      }
    }
    consola.log("");
  },
});

const info = defineCommand({
  meta: { description: "Show metadata for a harness" },
  args: { id: harnessArg, ...formatArgs },
  run({ args }) {
    const harness = resolveHarness(args.id as string);

    if (
      emit(
        {
          id: harness.id,
          name: harness.name,
          binaries: harness.binaries,
          capabilities: harness.capabilities,
          invocationModes: harness.invocationModes,
          modelListing: harness.modelListing !== null,
          modelSelection: harness.invocation?.modelArgs !== undefined,
          config: harness.config,
          sessions: harness.sessions,
          instructions: harness.instructions,
          skills: harness.skills,
          commands: harness.commands,
          hooks: harness.hooks,
          persistence: harness.persistence,
          detection: harness.detection,
        },
        args,
      )
    )
      return;

    consola.log(header(`${harness.name}  ${s.dim(harness.id)}`));

    consola.log(section("Binaries"));
    for (const b of harness.binaries) consola.log(entry(s.white(b)));

    consola.log(section("Capabilities"));
    const caps = Object.entries(harness.capabilities)
      .map(([k, v]) => (v ? s.green(k) : s.dim(k)))
      .join(s.dim("  ·  "));
    consola.log(entry(caps));

    consola.log(section("Invocation modes"));
    const modes = Object.entries(harness.invocationModes)
      .map(([k, v]) => (v ? s.green(k) : s.dim(k)))
      .join(s.dim("  ·  "));
    consola.log(entry(modes));

    consola.log(section("Models"));
    const modelFeatures = {
      listing: harness.modelListing !== null,
      selection: harness.invocation?.modelArgs !== undefined,
    };
    consola.log(
      entry(
        Object.entries(modelFeatures)
          .map(([k, v]) => (v ? s.green(k) : s.dim(k)))
          .join(s.dim("  ·  ")),
      ),
    );

    renderPathSection("Config", harness.config);
    renderPathSection("Sessions", harness.sessions);
    renderPathSection("Instructions", harness.instructions);
    renderPathSection("Skills", harness.skills);
    renderPathSection("Commands", harness.commands);
    renderPathSection("Hooks", harness.hooks);

    if (harness.persistence.length) {
      consola.log(section("Persistence"));
      for (const e of harness.persistence) {
        const note = e.note ? `  ${s.dim(e.note)}` : "";
        consola.log(entry(`${s.white(e.format)}${note}`));
      }
    }

    consola.log("");
  },
});

const paths = defineCommand({
  meta: { description: "Show resolved paths for current platform" },
  args: { id: harnessArg, ...formatArgs },
  run({ args }) {
    const harness = resolveHarness(args.id as string);
    const resolved = harness.resolve();

    if (emit(resolved, args)) return;

    consola.log(header(`${harness.name}  ${s.dim(process.platform)}`));

    renderResolvedPathSection("Config", resolved.config);
    renderResolvedPathSection("Sessions", resolved.sessions);
    renderResolvedPathSection("Instructions", resolved.instructions);
    renderResolvedPathSection("Skills", resolved.skills);
    renderResolvedPathSection("Commands", resolved.commands);
    renderResolvedPathSection("Hooks", resolved.hooks);

    consola.log("");
  },
});

const models = defineCommand({
  meta: { description: "List models available to a harness" },
  args: {
    id: harnessArg,
    search: {
      type: "positional" as const,
      description: "Optional native model search filter",
      required: false,
    },
    cwd: {
      type: "string" as const,
      description: "Working directory used while loading harness configuration",
    },
    timeout: { type: "string" as const, description: "Wall-clock budget in seconds" },
    ...formatArgs,
  },
  async run({ args }) {
    const timeoutSeconds = parsePositiveTimeout(args.timeout);
    if (timeoutSeconds === null) {
      consola.error(`Invalid timeout: ${args.timeout}`);
      process.exitCode = 1;
      return;
    }

    const result = await listHarnessModels(args.id as string, {
      search: args.search as string | undefined,
      cwd: args.cwd,
      timeoutSeconds,
    });
    if (emit(result.details, args)) {
      if (result.isError) process.exitCode = 1;
      return;
    }
    if (result.isError || !("models" in result.details)) {
      consola.error(modelFailureMessage(result.details));
      process.exitCode = 1;
      return;
    }

    renderModels(result.details);
  },
});

const run = defineCommand({
  meta: { description: "Run one prompt through a harness's non-interactive mode" },
  args: {
    id: harnessArg,
    prompt: {
      type: "positional" as const,
      description: "Prompt to send to the harness",
      required: true,
    },
    cwd: { type: "string" as const, description: "Working directory for the run" },
    model: { type: "string" as const, description: "Harness-native model id or selector" },
    timeout: { type: "string" as const, description: "Wall-clock budget in seconds" },
    json: {
      type: "boolean" as const,
      description: "Use the harness's structured (JSON) output mode",
    },
    tools: {
      type: "boolean" as const,
      description: "Enable tools; default false uses native advisor without tools mode",
    },
    "read-only": {
      type: "boolean" as const,
      description: "Require native read-only tool enforcement; implies --tools",
    },
  },
  async run({ args }) {
    const harness = resolveHarness(args.id as string);
    const structured = args.json === true;
    const readOnly = args["read-only"] === true;
    const tools = readOnly || args.tools === true;

    const invocationOptions = { model: args.model, structured, tools, readOnly };
    if (!harness.buildInvocation("", invocationOptions)) {
      consola.error(harness.invocationError(invocationOptions) ?? "Invalid invocation");
      process.exit(1);
    }

    const timeoutSeconds = parsePositiveTimeout(args.timeout);
    if (timeoutSeconds === null) {
      consola.error(`Invalid timeout: ${args.timeout}`);
      process.exit(1);
    }

    const result = await harness.invoke(args.prompt as string, {
      cwd: args.cwd,
      model: args.model,
      timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
      structured,
      tools,
      readOnly,
    });

    finishInvocation(result, timeoutSeconds);
  },
});

const main = defineCommand({
  meta: {
    name: "harnesses",
    version,
    description: "Metadata toolkit for AI coding harnesses",
  },
  subCommands: {
    list,
    detect,
    info,
    paths,
    models,
    run,
    "mcp-servers": () => import("./commands/mcp-servers.ts").then((m) => m.default),
    agents: () => import("./commands/agents.ts").then((m) => m.default),
    mcp: () => import("./commands/mcp.ts").then((m) => m.default),
  },
});

await runMain(main);
