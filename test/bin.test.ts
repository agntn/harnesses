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

const RESTART = "src/ changed under this server, restart it to load the new code";

const refused = { isError: true, content: [{ type: "text", text: RESTART }] };

/* A spawn a pull lands under: the answer goes, the warning stays. */
const mayHaveRun = {
  isError: true,
  content: [
    {
      type: "text",
      text: `${RESTART}\nThe call's answer was dropped, and it may have run. Check before retrying.`,
    },
  ],
};

/* A writable checkout with `edit` run over `file`, which must change it. */
function patchedCheckout(file: string, edit: (source: string) => string) {
  const checkout = writableCheckout();
  const path = join(checkout, file);
  const source = readFileSync(path, "utf8");
  const edited = edit(source);
  expect(edited, `the anchor in ${file} moved`).not.toBe(source);
  writeFileSync(path, edited);
  return checkout;
}

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

  it.each(builds)(
    "keeps a 2026 client on 2026 past a bare notification, from the $from",
    (build) => {
      const meta = {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "raw", version: "0" },
        "io.modelcontextprotocol/clientCapabilities": { elicitation: { form: {} } },
      };
      const input = [
        { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } },
        { jsonrpc: "2.0", method: "notifications/roots/list_changed", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } },
      ]
        .map((message) => `${JSON.stringify(message)}\n`)
        .join("");
      const child = spawnSync(process.execPath, [join(root, "dist/cli.mjs"), "mcp"], {
        encoding: "utf8",
        env: { ...env, ...build.env },
        input,
        timeout: 20_000,
      });
      const list = child.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { id?: number; result?: { resultType?: string } })
        .find((message) => message.id === 2);
      expect(list?.result?.resultType, child.stderr).toBe("complete");
    },
  );

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

  it("drops a read a pull landed under, with nothing to double check", async () => {
    const checkout = patchedCheckout(
      "src/tool-operations.ts",
      (source) =>
        `import { writeFileSync } from "node:fs";\n${source.replace(
          '  if (typeof input === "string") {',
          `  writeFileSync(new URL("./pulled.ts", import.meta.url), "export {};\\n");
  if (typeof input === "string") {`,
        )}`,
    );
    const client = await connect(checkout);
    try {
      expect(
        await client.callTool({ name: "harnesses_info", arguments: { id: "pi" } }),
      ).toStrictEqual(refused);
    } finally {
      await client.close();
    }
  });

  it("drops a spawn a pull landed under, saying it may have run", async () => {
    const checkout = patchedCheckout(
      "src/tool-operations.ts",
      (source) =>
        `import { writeFileSync } from "node:fs";\n${source.replace(
          "  const built = harness.buildModelListInvocation(options.search);",
          `  writeFileSync(new URL("./pulled.ts", import.meta.url), "export {};\\n");
  return { content: [{ type: "text", text: "listed" }] };`,
        )}`,
    );
    const client = await connect(checkout);
    try {
      expect(
        await client.callTool({ name: "harnesses_models", arguments: { id: "codex" } }),
      ).toStrictEqual(mayHaveRun);
    } finally {
      await client.close();
    }
  });

  it("lets progress through while it watches src/", async () => {
    const checkout = patchedCheckout("src/tools.ts", (source) =>
      source.replace(
        "execute: async (_input, { signal }) => (await loadOperations(signal)).detectHarnesses(),",
        `execute: async (_input, { signal, progress }) => {
      progress?.("scanning PATH");
      return (await loadOperations(signal)).detectHarnesses();
    },`,
      ),
    );
    const client = await connect(checkout);
    const messages: unknown[] = [];
    try {
      const answer = await client.callTool(
        { name: "harnesses_detect", arguments: {} },
        { onprogress: ({ message }) => messages.push(message) },
      );
      expect(answer.isError).not.toBe(true);
      expect(messages).toEqual(["scanning PATH"]);
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
