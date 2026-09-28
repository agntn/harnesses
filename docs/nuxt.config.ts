import { fileURLToPath } from "node:url";
import { harnessesTheme } from "./shiki-theme";

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
        description: "Pages built from the registry rather than from Markdown.",
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
        "lucide:arrow-down",
        "lucide:arrow-left",
        "lucide:arrow-right",
        "lucide:arrow-up",
        "lucide:arrow-up-right",
        "lucide:book-open",
        "lucide:bot",
        "lucide:check",
        "lucide:check-circle",
        "lucide:chevron-down",
        "lucide:chevron-left",
        "lucide:chevron-right",
        "lucide:chevrons-up-down",
        "lucide:circle-alert",
        "lucide:circle-x",
        "lucide:code-xml",
        "lucide:copy",
        "lucide:cpu",
        "lucide:expand",
        "lucide:external-link",
        "lucide:file-text",
        "lucide:ghost",
        "lucide:info",
        "lucide:layers",
        "lucide:library",
        "lucide:lightbulb",
        "lucide:link",
        "lucide:loader-circle",
        "lucide:map",
        "lucide:orbit",
        "lucide:pi",
        "lucide:play",
        "lucide:plus",
        "lucide:search",
        "lucide:server",
        "lucide:sliders-horizontal",
        "lucide:terminal",
        "lucide:triangle-alert",
        "lucide:x",
        "simple-icons:anthropic",
        "simple-icons:cursor",
        "simple-icons:github",
        "simple-icons:githubcopilot",
        "simple-icons:google",
        "simple-icons:googlegemini",
        "simple-icons:markdown",
        "simple-icons:openai",
        "simple-icons:x",
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
        { name: "theme-color", content: "#0b0d10" },
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
  /** Fonts live in public/fonts and app/assets/fonts.css, which is the only place nuxt-og-image reads them from. */
  css: ["~/assets/fonts.css"],
  fonts: {
    families: [
      { name: "Figtree", provider: "local", weights: [400, 500] },
      { name: "Fira Code", provider: "local", weights: [400, 500] },
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
            default: harnessesTheme,
            light: harnessesTheme,
            dark: harnessesTheme,
          },
        },
      },
    },
  },
});
