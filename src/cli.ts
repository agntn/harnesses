#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { encode as toToon } from "@toon-format/toon";
import { version } from "./types.ts";
import { getAllClients, getClient, listClients } from "./index.ts";
import type { ClientId } from "./types.ts";

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

const clientArg = {
  type: "positional" as const,
  description: "Client id",
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

function isClientId(id: string): id is ClientId {
  return (listClients() as string[]).includes(id);
}

function resolveClient(id: string): ReturnType<typeof getClient> {
  if (!isClientId(id)) {
    consola.error(`Unknown client: ${id}\nKnown: ${listClients().join(", ")}`);
    process.exit(1);
  }
  return getClient(id);
}

const list = defineCommand({
  meta: { description: "List all known clients" },
  args: { ...formatArgs },
  run({ args }) {
    const clients = getAllClients();
    const data = clients.map((c) => ({ id: c.id, name: c.name }));

    if (emit(data, args)) return;

    consola.log(header("Clients"));
    consola.log("");
    const maxId = Math.max(...data.map((r) => r.id.length));
    for (const { id, name } of data) {
      consola.log(entry(`${s.hi(id.padEnd(maxId))}  ${name}`));
    }
    consola.log("");
  },
});

const detect = defineCommand({
  meta: { description: "Detect installed clients and versions" },
  args: { ...formatArgs },
  run({ args }) {
    const clients = getAllClients();
    const results = clients.map((client) => {
      const installed = client.isInstalled();
      const v = installed ? client.getVersion() : null;
      return { id: client.id, name: client.name, installed, version: v };
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
  meta: { description: "Show metadata for a client" },
  args: { id: clientArg, ...formatArgs },
  run({ args }) {
    const client = resolveClient(args.id as string);

    if (
      emit(
        {
          id: client.id,
          name: client.name,
          binaries: client.binaries,
          capabilities: client.capabilities,
          config: client.config,
          sessions: client.sessions,
          instructions: client.instructions,
          skills: client.skills,
          commands: client.commands,
          hooks: client.hooks,
          persistence: client.persistence,
          detection: client.detection,
        },
        args,
      )
    )
      return;

    consola.log(header(`${client.name}  ${s.dim(client.id)}`));

    consola.log(section("Binaries"));
    for (const b of client.binaries) consola.log(entry(s.white(b)));

    consola.log(section("Capabilities"));
    const caps = Object.entries(client.capabilities)
      .map(([k, v]) => (v ? s.green(k) : s.dim(k)))
      .join(s.dim("  ·  "));
    consola.log(entry(caps));

    renderPathSection("Config", client.config);
    renderPathSection("Sessions", client.sessions);
    renderPathSection("Instructions", client.instructions);
    renderPathSection("Skills", client.skills);
    renderPathSection("Commands", client.commands);
    renderPathSection("Hooks", client.hooks);

    if (client.persistence.length) {
      consola.log(section("Persistence"));
      for (const e of client.persistence) {
        const note = e.note ? `  ${s.dim(e.note)}` : "";
        consola.log(entry(`${s.white(e.format)}${note}`));
      }
    }

    consola.log("");
  },
});

const paths = defineCommand({
  meta: { description: "Show resolved paths for current platform" },
  args: { id: clientArg, ...formatArgs },
  run({ args }) {
    const client = resolveClient(args.id as string);
    const resolved = client.resolve();

    if (emit(resolved, args)) return;

    consola.log(header(`${client.name}  ${s.dim(process.platform)}`));

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
    name: "aixa",
    version,
    description: "Metadata toolkit for AI CLIs",
  },
  subCommands: { list, detect, info, paths },
});

runMain(main);
