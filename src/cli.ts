#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { encode as toToon } from "@toon-format/toon";
import { version } from "./types.ts";
import { getAllHarnesses, getHarness, listHarnesses } from "./index.ts";
import type { HarnessId } from "./types.ts";

const s = {
  cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
  hi: (t: string) => `\x1b[96m${t}\x1b[0m`,
  green: (t: string) => `\x1b[32m${t}\x1b[0m`,
  red: (t: string) => `\x1b[31m${t}\x1b[0m`,
  dim: (t: string) => `\x1b[90m${t}\x1b[0m`,
  bold: (t: string) => `\x1b[1m${t}\x1b[0m`,
  white: (t: string) => `\x1b[97m${t}\x1b[0m`,
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
  entries: { path: string; scope: string; platforms?: string[]; note?: string }[],
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

function emit(data: unknown, args: { json?: boolean; toon?: boolean }) {
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

function isHarnessId(id: string): id is HarnessId {
  return (listHarnesses() as string[]).includes(id);
}

function resolveHarness(id: string): ReturnType<typeof getHarness> {
  if (!isHarnessId(id)) {
    consola.error(`Unknown harness: ${id}\nKnown: ${listHarnesses().join(", ")}`);
    process.exit(1);
  }
  return getHarness(id);
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

    if (resolved.config.length) {
      consola.log(section("Config"));
      for (const e of resolved.config) consola.log(entry(s.hi(e.path)));
    }

    if (resolved.sessions.length) {
      consola.log(section("Sessions"));
      for (const e of resolved.sessions) consola.log(entry(s.hi(e.path)));
    }

    if (resolved.instructions.length) {
      consola.log(section("Instructions"));
      for (const e of resolved.instructions) consola.log(entry(s.hi(e.path)));
    }

    if (resolved.skills.length) {
      consola.log(section("Skills"));
      for (const e of resolved.skills) consola.log(entry(s.hi(e.path)));
    }

    if (resolved.commands.length) {
      consola.log(section("Commands"));
      for (const e of resolved.commands) consola.log(entry(s.hi(e.path)));
    }

    if (resolved.hooks.length) {
      consola.log(section("Hooks"));
      for (const e of resolved.hooks) consola.log(entry(s.hi(e.path)));
    }

    consola.log("");
  },
});

const main = defineCommand({
  meta: {
    name: "harnesses",
    version,
    description: "Metadata toolkit for AI coding harnesses",
  },
  subCommands: { list, detect, info, paths },
});

runMain(main);
