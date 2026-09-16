# docs/

Docus site for `@agntn/harnesses`. Markdown lives in `content/`. The explorer is a Vue page that reads the registry a Nuxt module copies out of the library at build time. There is no server API: the library spawns processes and reads the filesystem, so it stays out of the browser and out of the worker.

## Layout

```
docs/
├── nuxt.config.ts                 # extends: ['docus'], cloudflare_module preset (Workers)
├── app/app.config.ts              # title, github, theme, seo schema
├── app/app.css                    # theme tokens (light + .dark), shared `harnesses-*` classes
├── app/components/                # Docus overrides: AppHeaderLogo, AppHeaderCTA (nav), AppFooterLeft, DocsAsideLeftBody; icons are Solar (linear), brands stay simple-icons
├── app/components/content/        # MDC components (`::landing-home`, `::harness-facts`, `::harness-sheet`), the landing panels, HarnessesExplorer, CodeSnippet
├── app/components/OgImage/        # Docs.takumi and Landing.takumi override the Docus OG templates
├── app/assets/fonts.css           # @font-face for the TTFs served from public/fonts (site and OG images)
├── app/composables/               # useLandingHarness (one clock for every live panel), useSubNavigation
├── app/utils/                     # harnesses table (icons, blurbs, resolve and buildCommand ports), highlight, format
├── shared/types/registry.ts       # HarnessRecord as a Pick of Harness, plus the path and platform types the pages read
├── modules/registry.ts            # runs getAllHarnesses() from ../src/registry.ts in Node, ships the records as `#harnesses-registry`
├── app/pages/explorer.vue         # explorer, own route outside the docs layout, its own useSeo and OG image
├── server/routes/sitemap.xml.ts   # Docus sitemap plus the Vue pages it cannot see
├── public/                        # fonts, favicon.svg and the icons and manifest cut from it
├── content/index.md               # landing
├── content/1.guide/               # getting started, registry, invoke, mcp-servers, agents-sync, cli, agents, sessions, custom, explorer
└── content/2.harnesses/           # one page per harness
```

## Commands

```bash
pnpm install          # from docs/; the root needs no install, the module reads ../src directly
pnpm dev              # http://localhost:3000; a change in ../src needs a restart, the module runs once at startup
pnpm build            # Cloudflare Workers output in .output/, content routes prerendered
pnpm deploy           # build, then wrangler deploy to harnesses.agntn.dev
pnpm generate         # static output; nothing on this site needs the worker at runtime
```

Deployment: Workers Builds with root directory `docs` and build command `pnpm run build`. It installs `docs/` and nothing else, and that's enough: `modules/registry.ts` imports `../src/registry.ts` and `../src/types.ts`, a subgraph with no third-party dependency, so it needs neither `dist/` nor the root `node_modules`. An npm import anywhere under that subgraph breaks the deploy, so keep it that way. Nitro preset `cloudflare_module`. Nuxt Content wants a D1 binding named `DB`. `wrangler.jsonc` carries it plus the `NUXT_SITE_URL` var, and Nitro merges that into the generated `.output/server/wrangler.json`. Create the database once with `wrangler d1 create agntn-harnesses` and put the id in `wrangler.jsonc`. Until then the id is all zeros on purpose - `pnpm deploy` with zeros binds nothing, so don't run it before the id is real. No KV binding. Nothing is fetched at runtime.

Two resolution traps, both because the repo root is its own pnpm workspace:

- `pnpm-workspace.yaml` sets `shamefullyHoist: true`. Without it `docs/node_modules` holds only direct dependencies, Node walks up to the root `node_modules`, and the server bundle can end up with a second copy of Vue.
- `nuxt.config.ts` pins `workspaceDir` to `docs/` and disables devtools and telemetry, which would otherwise resolve from the root.

## The registry

- `#harnesses-registry` is the single source for every number, path, template and marker on the site. `modules/registry.ts` imports `getAllHarnesses()` from `../src/registry.ts` and `version` from `../src/types.ts` (jiti runs the TypeScript, no `dist/` needed), maps every harness onto `HarnessRecord`, a `Pick` of the `Harness` data members in `shared/types/registry.ts`, and writes the result as one typed `.ts` template Nuxt bundles. Nothing is committed, so the site can't drift from the library in the same commit. A harness added to the library shows up in the grid, the sidebar and the explorer by itself; it needs one entry in `PRESENTATION` in `app/utils/harnesses.ts` (icon, short label, blurb) and a page in `content/2.harnesses/`, and the utils throw at import if the entry is missing.
- `resolveTemplate` and `buildCommand` in `app/utils/harnesses.ts` are ports of `resolvePathTemplate` and `Harness.buildInvocation`. They exist because the library cannot be imported into the browser. One known divergence: `resolveTemplate` substitutes fixed Windows defaults for `%PROGRAMDATA%`, `%APPDATA%`, `%LOCALAPPDATA%` and `%USERPROFILE%`, where the library reads `process.env`; the explorer page says so. Change the library's expansion or argument order, change them too; the explorer is the place that would be wrong otherwise.
- Values are deterministic, so SSR and the client agree and hydration doesn't flicker. No `Math.random`, no clock inside a computed.
- `HarnessesExplorer.vue` reads the deep link in `onMounted`, once. A prerendered page hydrates with an empty query and Nuxt restores the address afterwards, so reading `route.query` in setup gives you nothing. It writes state back with `router.replace` on every change.

## SEO

- `seo.schema` in `app/app.config.ts` emits the landing JSON-LD: `WebSite`, the agntn `Organization` as publisher, and a free `SoftwareApplication` with `sameAs` on GitHub and npm. Docs pages get `Article` plus `BreadcrumbList` from Docus on their own.
- The Docus sitemap reads content collections only. `server/routes/sitemap.xml.ts` wraps it and appends the Vue pages listed in `PAGES`; a new page under `app/pages/` goes there too or it is invisible to crawlers.
- Docus links `/favicon.ico` without shipping one. `public/favicon.svg` is the source, the PNGs and the `.ico` are cut from it with ImageMagick, `app.head` in `nuxt.config.ts` links them with the manifest and theme colours.

## OG images

- `app/components/OgImage/Docs.takumi.vue` and `Landing.takumi.vue` override the Docus templates of the same name and are rendered by Takumi at build time. Takumi has no CSS variables, so the theme colours from `app.css` are repeated there as literals.
- nuxt-og-image doesn't see the faces `@nuxt/fonts` generates on this Nuxt version, but it does parse `@font-face` rules from the files in `css`. That's why `app/assets/fonts.css` declares the five TTFs in `public/fonts` and `fonts.families` uses the `local` provider.
- The landing OG file is named from the SEO description. Nitro refuses to write a prerender path containing `..`, so a description ending in a period is silently skipped and the landing ships with a dead `og:image`. Keep the description in `content/index.md` without a trailing period.

## Constraints

- Text a visitor types into the explorer is rendered as text, through interpolation or a `<pre>`. Never `v-html` on it. `CodeSnippet` uses `v-html` only on markup our own tokenizer produced from escaped text.
- Harness names, icons, blurbs live once, in `app/utils/harnesses.ts`. Sidebar, landing grid, explorer and `::harness-facts` read from it. Paths, templates, capabilities and markers come from the registry and are not repeated here.
- Every path, flag and error message quoted in `content/` has a line in `src/`. Check a new one the same way before writing it down.
- The site makes no network request for its own work and reads nothing from the visitor's machine. The footer says so.
