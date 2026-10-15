# Contributing

## Setup

`pnpm install`, and you're in. CI runs `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test:run` in that order, so run the same four before you push.

`lint` and `typecheck` build first, because the Pi and OMP extensions import their schemas and types from `dist/`. That means `build`, `lint`, `typecheck` and packing all rewrite `dist/`. Running `harnesses mcp` or an extension straight from your checkout? Work in a separate worktree, or the live server gets a new bundle under its feet.

The docs site has its own install: `pnpm --dir docs install`, then `pnpm docs`.

## Adding a harness

1. Add the id to the `HarnessId` union in `src/types.ts`.
2. Write `src/harnesses/<id>.ts`, a class extending `Harness`. Every path is a `PathCandidate` with its scope and evidence level, and whatever you couldn't verify stays empty, `null` or `inferred`. A guessed path is worse than a missing one.
3. Import it in `src/harnesses/index.ts`. The list order is the env detection order, so a fork that still sets its parent's env marker goes before the parent.
4. Give it a row in the README harnesses table.
5. Put the id in `should expose stable harness ids` and in the audio and video table in `test/index.test.ts`.
6. Add its icon, label and blurb to `PRESENTATION` in `docs/app/utils/harnesses.ts`, and a page in `docs/content/2.harnesses/` that opens with `::harness-facts{id="<id>"}`.

Forget step 4 or 6 and `test/docs.test.ts` tells you which one.

## Code

- ESM only. Local imports carry their `.ts` extension.
- `sideEffects: false` holds because `src/harnesses/index.ts` imports every harness by name. A module that registers itself on import would quietly vanish from a consumer's bundle.
- The public API goes through `src/index.ts`. Anything a harness formats its own way gets parsed in its `src/harnesses/<id>.ts`, so no provider shape leaks into the top level.
- A public API change brings its tests and a README example along.
- The library, the CLI, the tool operations and the MCP server move together. Commands in `src/commands/` only parse input; the behavior lives in `src/tool-operations.ts`, `src/mcp-servers.ts` or the sync modules. Machine output goes through `src/commands/output.ts`, and human text gets sanitized before it's written.
- A capability a harness doesn't have fails out loud. An empty result that looks like success is a lie the agent believes.
- `src/schemas/` is type-only. Fields with an upstream shape that keeps moving stay `unknown` on purpose, so no Zod and no tighter types until that format settles down.
- The tsconfig is strict and stays that way. No `as any`, `@ts-ignore` or `@ts-expect-error`; fix the code instead.
- `build.config.ts` is the only build. No ad hoc scripts beside it.

## Agent tools and extensions

- Schemas live in `src/tool-schemas.ts`, executors in `src/tool-operations.ts`. The Pi and OMP adapters reuse both, load the executors lazily and register every tool, so a fix lands on all surfaces at once.
- `packages/shared/tui.ts` returns plain strings and keeps collapsed status lines short. Every outside value gets sanitized before a terminal sees it.

## Tests

- Tests import from `vite-plus/test` and are written in English.
- No network and no installed harness. Prefer public interfaces and real local seams over module mocks.
- Touching env, temp files, timers or the global registry? Register the cleanup right next to the change.
- Invocation tests go in `test/invoke.test.ts` and assert the exact argument array whenever argument order is part of the contract.

## Docs site

- `docs/modules/registry.ts` runs `getAllHarnesses()` at build time and hands the pages every path, template and marker they show. Workers Builds installs `docs/` alone, so that import graph stays free of npm packages. `test/docs.test.ts` keeps it honest.
- `resolveTemplate` and `buildCommand` in `docs/app/utils/harnesses.ts` are browser ports of `resolvePathTemplate` and `Harness.buildInvocation`. Change the library's expansion or argument order and change them too, or the explorer starts making things up.
- Values render the same on server and client: no `Math.random`, no clock inside a computed.
- Visitor input renders as text, never through `v-html`.
- A page under `docs/app/pages/` calls `useSeo` and `defineOgImage` itself and goes into `PAGES` in `server/routes/sitemap.xml.ts`. Skip it and crawlers never see the page.
- The landing OG image is named after its SEO description, so that description never ends with a period. Nitro won't prerender a path with `..` in it and the landing ships a dead `og:image` without a word.
- Every path, flag and error message quoted in `content/` has a line in `src/`. Check it there before writing it down.
- The site makes no network request of its own and reads nothing from the visitor's machine. The footer promises that.
- Instruments and their departures from the agntn family are in `docs/DESIGN.md`.
