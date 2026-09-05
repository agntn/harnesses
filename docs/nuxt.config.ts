import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  extends: ["docus"],
  /** The repo root is its own pnpm workspace; Nuxt must not treat it as this site's. */
  workspaceDir: fileURLToPath(new URL("./", import.meta.url)),
  devtools: { enabled: false },
  telemetry: false,
  site: {
    url: "https://harnesses.agntn.dev",
    name: "@agntn/harnesses",
  },
  llms: {
    domain: "https://harnesses.agntn.dev",
    title: "@agntn/harnesses",
    description:
      "Metadata registry for twelve AI coding harnesses: paths with evidence levels, detection, headless invocation, MCP and AGENTS.md sync.",
    sections: [
      {
        title: "Tools",
        description: "Pages built from the registry snapshot rather than from Markdown.",
        links: [
          {
            title: "Explorer",
            description:
              "Every harness's paths expanded for a platform and home directory, and the command each invoke mode spawns.",
            href: "https://harnesses.agntn.dev/explorer",
          },
        ],
      },
    ],
    notes: [
      "Every path, template and marker on the site comes from the published @agntn/harnesses registry; the CLI on a real machine is the source of truth for resolved paths.",
    ],
  },
  /** Docus pages define their own OG images; the alt text is the one thing they leave unset. */
  ogImage: {
    defaults: {
      alt: "@agntn/harnesses: a metadata registry for AI coding harnesses",
    },
  },
  icon: {
    clientBundle: {
      icons: [
        "lucide:external-link",
        "lucide:x",
        "simple-icons:anthropic",
        "simple-icons:github",
        "simple-icons:githubcopilot",
        "simple-icons:google",
        "simple-icons:googlegemini",
        "simple-icons:npm",
        "simple-icons:openai",
        "simple-icons:x",
        "solar:add-circle-linear",
        "solar:alt-arrow-left-linear",
        "solar:alt-arrow-right-linear",
        "solar:arrow-right-linear",
        "solar:arrow-right-up-linear",
        "solar:atom-linear",
        "solar:book-2-linear",
        "solar:bot-linear",
        "solar:close-circle-linear",
        "solar:code-2-linear",
        "solar:code-square-linear",
        "solar:copy-linear",
        "solar:cursor-linear",
        "solar:document-text-linear",
        "solar:ghost-linear",
        "solar:info-circle-linear",
        "solar:layers-linear",
        "solar:library-linear",
        "solar:link-linear",
        "solar:map-point-linear",
        "solar:planet-linear",
        "solar:play-circle-linear",
        "solar:server-linear",
        "solar:tuning-2-linear",
        "solar:unread-linear",
        "vscode-icons:file-type-js",
        "vscode-icons:file-type-json",
        "vscode-icons:file-type-shell",
        "vscode-icons:file-type-typescript",
      ],
    },
  },
  colorMode: {
    preference: "dark",
  },
  app: {
    head: {
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
      meta: [
        { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0b0d10" },
        { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#eef1f4" },
        { name: "apple-mobile-web-app-title", content: "harnesses" },
        { name: "author", content: "oritwoen" },
        { property: "og:locale", content: "en_US" },
      ],
    },
  },
  /** Docus ships an MCP endpoint that wants the Cloudflare Agents SDK on Workers. Not needed. */
  mcp: {
    enabled: false,
  },
  nitro: {
    preset: "cloudflare_module",
    compatibilityDate: "2026-09-03",
    prerender: {
      crawlLinks: true,
      routes: ["/", "/explorer", "/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"],
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  compatibilityDate: "2026-09-03",
  /** Fonts live in public/fonts and app/assets/fonts.css, where nuxt-og-image reads them from. */
  css: ["~/assets/fonts.css"],
  fonts: {
    families: [
      { name: "Space Grotesk", provider: "local", weights: [400, 500, 600] },
      { name: "Space Mono", provider: "local", weights: [400, 700] },
    ],
  },
  content: {
    database: {
      type: "d1",
      bindingName: "DB",
    },
    build: {
      markdown: {
        highlight: {
          theme: {
            default: "github-light",
            light: "github-light",
            dark: "poimandres",
          },
        },
      },
    },
  },
});
