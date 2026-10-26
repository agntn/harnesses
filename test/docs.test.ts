import { globSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { listHarnesses } from "../src/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

/** A bare specifier after `from` or in `import()`. Sample code in a string matches too. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([@a-z][^"'\s]*)["']/gu;

/* Packages the site imports, minus `node:` and the library, which the landing only quotes. */
function docsImports(): Set<string> {
  const sources = [
    "app/**/*.{ts,vue}",
    "modules/**/*.ts",
    "server/**/*.ts",
    "shared/**/*.ts",
    "*.ts",
  ];
  const names = new Set<string>();
  for (const file of globSync(sources, { cwd: resolve(root, "docs") })) {
    for (const match of read(`docs/${file}`).matchAll(SPECIFIER)) {
      const parts = (match[1] ?? "").split("/");
      const name = parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
      if (!name.startsWith("node:") && name !== "@agntn/harnesses") names.add(name);
    }
  }
  return names;
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

  /** Nothing is hoisted, so a package the site forgets is missing on Workers Builds. */
  it("declares every package the site imports", () => {
    const manifest = JSON.parse(read("docs/package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set(
      Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }),
    );
    const imported = docsImports();
    expect(imported.size).toBeGreaterThan(0);
    expect([...imported].filter((name) => !declared.has(name))).toEqual([]);
  });

  /** Workers Builds takes Node from .node-version and never reads engines. */
  it("pins the build image to the Node major engines names", () => {
    const { engines } = JSON.parse(read("package.json")) as { engines: { node: string } };
    expect(read(".node-version").trim()).toMatch(
      new RegExp(`^v?${/\d+/u.exec(engines.node)?.[0]}\\.`, "u"),
    );
  });

  /** Agents read llms.txt and the SEO blurbs as fact, and "twelve" outlived Prime Agent there. */
  it("spells the harness count the registry actually has", () => {
    const spelled = /const WORDS = \[([^\]]*)\]/u.exec(read("docs/app/utils/format.ts"))?.[1] ?? "";
    const numbers = [...spelled.matchAll(/"(\w+)"/gu)].map((match) => match[1]?.toLowerCase());
    const counted = new RegExp(
      `\\b(${numbers.join("|")})\\s+(?:(?:AI\\s+)?coding\\s+(?:agents|CLIs|harnesses)\\b|harnesses,|built-ins\\b)`,
      "giu",
    );
    const pages = readdirSync(resolve(root, "docs/content"), { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith(".md"))
      .map((path) => `docs/content/${path}`);
    const expected = numbers[listHarnesses().length];
    expect(expected).toBeDefined();
    let checked = 0;
    for (const path of ["README.md", "docs/nuxt.config.ts", "docs/app/app.config.ts", ...pages]) {
      for (const match of read(path).matchAll(counted)) {
        expect(match[1]?.toLowerCase(), `${path}: ${match[0]}`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  /** The OG file is named after this description, and Nitro skips a prerender path holding `..`. */
  it("keeps the landing SEO description free of a trailing period", () => {
    const raw = /^ {2}description: (.*)$/mu.exec(read("docs/content/index.md"))?.[1] ?? "";
    const description = raw.trim().replace(/^(["'])(.*)\1$/u, "$2");
    expect(description).not.toBe("");
    expect(description).not.toMatch(/\.\s*$/u);
  });
});
