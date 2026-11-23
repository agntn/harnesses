import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vite-plus/test";

const root = resolve(import.meta.dirname, "..");

const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[0] !== "HARNESSES_DIST" && entry[0] !== "NODE_OPTIONS" && entry[1] !== undefined,
  ),
);

const initialize = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "harnesses-test", version: "1.0.0" },
  },
})}\n`;

/* Plain JavaScript hook, so it survives `--no-experimental-strip-types`. */
function recordLoads(file: string) {
  return `data:text/javascript,${encodeURIComponent(`
  import { writeFileSync } from "node:fs";
  import { registerHooks } from "node:module";
  const loaded = [];
  registerHooks({ load(url, context, nextLoad) { loaded.push(url); return nextLoad(url, context); } });
  process.on("exit", () => writeFileSync(${JSON.stringify(file)}, JSON.stringify(loaded)));
`)}`;
}

const copies: string[] = [];

afterEach(() => {
  for (const copy of copies.splice(0)) rmSync(copy, { recursive: true, force: true });
});

/* Copies checkout `entries` under `parent`; removed after the test. */
function copyCheckout(
  parent: string,
  entries: readonly string[] = ["dist", "src", "package.json"],
) {
  mkdirSync(parent, { recursive: true });
  const copy = mkdtempSync(join(parent, "harnesses-bin-"));
  copies.push(copy);
  for (const entry of entries) cpSync(join(root, entry), join(copy, entry), { recursive: true });
  return copy;
}

/* One initialize against the bin in `base`, and which build answered. */
function serve(
  base: string,
  options: Readonly<{ env?: Readonly<Record<string, string>>; flags?: readonly string[] }> = {},
) {
  const record = mkdtempSync(join(tmpdir(), "harnesses-loaded-"));
  copies.push(record);
  const file = join(record, "loaded.json");
  const child = spawnSync(
    process.execPath,
    [...(options.flags ?? []), "--import", recordLoads(file), join(base, "dist/cli.mjs"), "mcp"],
    { encoding: "utf8", env: { ...env, ...options.env }, input: initialize, timeout: 20_000 },
  );
  const loaded = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as unknown[]).map(String)
    : [];
  expect(loaded, child.stderr).toContain(pathToFileURL(join(base, "dist/cli.mjs")).href);
  const source = pathToFileURL(join(base, "src/commands/mcp.ts")).href;
  const name = /"serverInfo":\{"name":"([^"]+)"/u.exec(child.stdout)?.[1];
  return { code: child.status, from: loaded.includes(source) ? "source" : "bundle", name };
}

type Era = "legacy" | Readonly<{ pin: string }>;

/* A client of one protocol era connected to `mcp` from the built bin of `checkout`. */
async function connect(
  checkout: string,
  session: Readonly<{ env?: Readonly<Record<string, string>>; mode?: Era }> = {},
) {
  const client = new Client(
    { name: "harnesses-test", version: "1.0.0" },
    { versionNegotiation: { mode: session.mode ?? "legacy" } },
  );
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(checkout, "dist/cli.mjs"), "mcp"],
      env: { ...env, ...session.env },
      stderr: "ignore",
    }),
  );
  return client;
}

const builds = [
  { from: "source", env: {} },
  { from: "bundle", env: { HARNESSES_DIST: "1" } },
] as const;

/* A checkout copy whose `src/` a test may pull into. */
function writableCheckout() {
  const checkout = copyCheckout(tmpdir());
  symlinkSync(join(root, "node_modules"), join(checkout, "node_modules"), "dir");
  return checkout;
}

const dropped = {
  isError: true,
  content: [
    {
      type: "text",
      text: "src/ changed during this call, so its answer was dropped. It may have run: check before retrying, then restart the server",
    },
  ],
};

const refused = {
  isError: true,
  content: [
    { type: "text", text: "src/ changed under this server, restart it to load the new code" },
  ],
};

describe.skipIf(!existsSync(join(root, "dist/cli.mjs")))("harnesses mcp from the built bin", () => {
  it("serves the live source inside a checkout", () => {
    expect(serve(root)).toMatchObject({ code: 0, from: "source", name: "harnesses" });
  });

  it("keeps the bundle under HARNESSES_DIST=1", () => {
    expect(serve(root, { env: { HARNESSES_DIST: "1" } })).toMatchObject({
      code: 0,
      from: "bundle",
      name: "harnesses",
    });
  });

  it("keeps the bundle when Node does not strip types", () => {
    expect(serve(root, { flags: ["--no-experimental-strip-types"] })).toMatchObject({
      code: 0,
      from: "bundle",
      name: "harnesses",
    });
  });

  it("keeps the bundle when the package sits under node_modules", () => {
    const nested = copyCheckout(join(root, "node_modules/.cache"));
    expect(serve(nested)).toMatchObject({ code: 0, from: "bundle", name: "harnesses" });
  });

  it("keeps the bundle in a package that ships no src", () => {
    const packaged = copyCheckout(tmpdir(), ["dist", "package.json"]);
    symlinkSync(join(root, "node_modules"), join(packaged, "node_modules"), "dir");
    expect(serve(packaged)).toMatchObject({ code: 0, from: "bundle", name: "harnesses" });
  });

  it("serves the source with production dependencies alone", () => {
    const production = copyCheckout(tmpdir());
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    for (const name of Object.keys(manifest.dependencies)) {
      mkdirSync(join(production, "node_modules", name, ".."), { recursive: true });
      symlinkSync(join(root, "node_modules", name), join(production, "node_modules", name));
    }
    expect(serve(production)).toMatchObject({ code: 0, from: "source", name: "harnesses" });
  });

  it.each(builds)("lets a client pinned to 2026 listen, from the $from", async (build) => {
    const client = await connect(root, { env: build.env, mode: { pin: "2026-07-28" } });
    try {
      expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
      const subscription = await client.listen({ toolsListChanged: true });
      expect((await client.listTools()).tools).toHaveLength(11);
      await subscription.close();
    } finally {
      await client.close();
    }
  });

  it.each(builds)("still opens a 2025 client with initialize, from the $from", async (build) => {
    const client = await connect(root, { env: build.env });
    try {
      expect(client.getNegotiatedProtocolVersion()).toMatch(/^2025-/u);
      expect((await client.listTools()).tools).toHaveLength(11);
    } finally {
      await client.close();
    }
  });

  it("refuses a call after a pull before the executor starts", async () => {
    const checkout = writableCheckout();
    /* The executor marks a file outside `src/` whenever it runs. */
    const operations = join(checkout, "src/tool-operations.ts");
    writeFileSync(
      operations,
      `import { writeFileSync } from "node:fs";\n${readFileSync(operations, "utf8").replace(
        '  if (typeof input === "string") {',
        `  writeFileSync(new URL("../ran", import.meta.url), "");
  if (typeof input === "string") {`,
      )}`,
    );
    const client = await connect(checkout);
    try {
      await client.listTools();
      writeFileSync(join(checkout, "src/pulled.ts"), "export {};\n");

      for (const [name, args] of [
        ["harnesses_info", { id: "pi" }],
        ["harnesses_info", { unexpected: true }],
        ["harnesses_added", {}],
      ] as const) {
        expect(await client.callTool({ name, arguments: args })).toMatchObject(refused);
      }
      expect(existsSync(join(checkout, "ran"))).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("drops the answer of a call a pull landed under, saying it may have run", async () => {
    const checkout = writableCheckout();
    const operations = join(checkout, "src/tool-operations.ts");
    writeFileSync(
      operations,
      `import { writeFileSync } from "node:fs";\n${readFileSync(operations, "utf8").replace(
        '  if (typeof input === "string") {',
        `  writeFileSync(new URL("./pulled.ts", import.meta.url), "export {};\\n");
  if (typeof input === "string") {`,
      )}`,
    );
    const client = await connect(checkout);
    try {
      expect(
        await client.callTool({ name: "harnesses_info", arguments: { id: "pi" } }),
      ).toMatchObject(dropped);
    } finally {
      await client.close();
    }
  });

  it("refuses calls when a pull lands while src/ is still loading", async () => {
    const checkout = writableCheckout();
    /* A statically imported module writes into `src/`, like a pull mid-load. */
    const types = join(checkout, "src/types.ts");
    writeFileSync(
      types,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("./pulled.ts", import.meta.url), "export {};\\n");\n${readFileSync(types, "utf8")}`,
    );
    const client = await connect(checkout);
    try {
      expect(
        await client.callTool({ name: "harnesses_info", arguments: { id: "pi" } }),
      ).toMatchObject(refused);
    } finally {
      await client.close();
    }
  });

  it("answers as before while src/ stays put", async () => {
    const client = await connect(writableCheckout());
    try {
      const answer = await client.callTool({ name: "harnesses_info", arguments: { id: "pi" } });
      expect(answer.isError).not.toBe(true);
      expect(JSON.stringify(answer.content)).toContain("Pi");
    } finally {
      await client.close();
    }
  });
});
