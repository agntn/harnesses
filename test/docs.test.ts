import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { listHarnesses } from "../src/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

/* Every module the docs registry loads at runtime, with the bare specifiers it imports. */
function runtimeGraph(entries: readonly string[]): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const pending = entries.map((entry) => resolve(root, entry));
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    const imports =
      /^(?:import|export) (?!type )[^;]*?from "([^"]+)"|^import "([^"]+)"|import\("([^"]+)"\)/gmu;
    for (const match of source.matchAll(imports)) {
      const specifier = match[1] ?? match[2] ?? match[3] ?? "";
      if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier));
      else bare.add(specifier);
    }
  }
  return { files, bare };
}

describe("docs site", () => {
  /** A harness the library ships but the README or the site forgot is a harness nobody finds. */
  it("lists every registered harness in the README, the presentation table and its own page", () => {
    const readme = read("README.md");
    const presentation = read("docs/app/utils/harnesses.ts");
    const pages = readdirSync(resolve(root, "docs/content/2.harnesses"));
    for (const id of listHarnesses()) {
      expect(readme, id).toContain(`| \`${id}\``);
      expect(presentation, id).toMatch(new RegExp(`^ {2}"?${id}"?: \\{$`, "mu"));
      const page = pages.find((name) => name.replace(/^\d+\./u, "") === `${id}.md`);
      expect(page, id).toBeDefined();
      expect(read(`docs/content/2.harnesses/${page}`)).toContain(`::harness-facts{id="${id}"}`);
    }
  });

  /** Workers Builds installs docs/ alone, so one npm import in this graph breaks the deploy. */
  it("loads the registry without a single npm package", () => {
    const { files, bare } = runtimeGraph(["src/registry.ts", "src/types.ts"]);
    expect(files.size).toBeGreaterThan(listHarnesses().length);
    expect([...bare].filter((specifier) => !specifier.startsWith("node:"))).toEqual([]);
  });

  /** Workers Builds takes Node from .node-version and never reads engines. */
  it("pins the build image to the Node major engines names", () => {
    const { engines } = JSON.parse(read("package.json")) as { engines: { node: string } };
    expect(read(".node-version").trim()).toMatch(
      new RegExp(`^v?${/\d+/u.exec(engines.node)?.[0]}\\.`, "u"),
    );
  });

  /** The OG file is named after this description, and Nitro skips a prerender path holding `..`. */
  it("keeps the landing SEO description free of a trailing period", () => {
    const description = /^ {2}description: (.*)$/mu.exec(read("docs/content/index.md"))?.[1] ?? "";
    expect(description).not.toBe("");
    expect(description).not.toMatch(/\.\s*$/u);
  });
});
