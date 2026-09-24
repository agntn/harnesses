# @agntn/harnesses

Metadata registry for AI coding harnesses. Paths, formats, detection rules, session schemas - one TypeScript API over every harness registered in `src/harnesses/index.ts`.

## Commands

```bash
pnpm install              # install deps
pnpm lint                 # build, then oxlint + oxfmt check
pnpm lint:fix             # auto-fix lint/format
pnpm typecheck            # tsgo on src, build, then tsgo on the Pi/OMP extensions
pnpm build                # obuild (library, CLI, MCP server, tool modules)
pnpm test:run             # vitest --run
pnpm test                 # vitest watch mode

# single test
pnpm vitest run test/index.test.ts -t "should detect a harness from env vars"
```

Run order after changes: `lint` -> `typecheck` -> `build` -> `test:run`. CI does the same.

## Codebase map

```
src/
  index.ts              # public API barrel - all exports go through here
  types.ts              # HarnessId, HarnessCapabilities, PathCandidate, etc.
  harness.ts            # abstract Harness class (resolve, detect, isInstalled, version, invoke)
  registry.ts           # global Map<HarnessId, Harness>, detect functions
  resolve.ts            # path template expansion (~, ${HOME}, %ENVVAR%)
  mcp-servers.ts        # normalized MCP server read/write across harness config dialects
  agents-sync.ts        # symlink-based sync of global instructions files to one master
  prompt-sync.ts        # prompt template sync: directory links, generated Gemini TOML
  skills-sync.ts        # skills sync: each harness skills directory links to one source
  directory-link.ts     # directory link and backup shared by prompt and skills sync
  tool-schemas.ts       # tool parameter schemas shared by MCP and the Pi/OMP extensions
  tool-operations.ts    # tool executors behind those schemas
  mcp.ts                # MCP server over the shared tools (`harnesses mcp`)
  cli.ts                # citty CLI root
  commands/             # CLI subcommands (agents, mcp-servers, prompts, skills, mcp) and output helpers
  harnesses/
    index.ts            # constructor registry; order decides env detection priority
    <id>.ts             # one class per harness
  schemas/              # type-only session formats (claude, codex, gemini, opencode)
packages/               # shipped Pi and OMP extension adapters plus their shared TUI
test/                   # one Vitest file per area; index.test.ts covers registry, detection, resolution
build.config.ts         # one obuild bundle over five inputs, so entries share registry state
docs/                   # Docus site for harnesses.agntn.dev; own AGENTS.md, reads the registry from ../src at build time
```

Nested `AGENTS.md` files in `src/`, `src/commands/`, `test/`, `docs/` and each `packages/` adapter add local rules.

## Adding a new harness

1. Add the ID to `HarnessId` union in `src/types.ts`
2. Create `src/harnesses/<id>.ts` with a concrete class extending `Harness`
3. Import it in `src/harnesses/index.ts`; place it before any harness whose env markers it also sets
4. Add a row in the `README.md` harnesses table
5. Add the ID to `should expose stable harness ids` and the audio/video table in `test/index.test.ts`
6. Add an entry to `PRESENTATION` in `docs/app/utils/harnesses.ts` and a page in `docs/content/2.harnesses/`
7. Run `pnpm lint && pnpm typecheck && pnpm build && pnpm test:run`

Each harness class has: `config`, `sessions`, `persistence`, `instructions`, `skills`, `commands`, `hooks`, `capabilities`, `detection`, `invocation` (null when the CLI has no headless mode). Optional overrides: `promptTemplates` and `promptTemplateSyncTarget` (prompt locations and the sync destination), `skillsSyncTarget` (the user skills directory skills sync links; one of `skills`), `modelListing` (null without a native model list), `mcpConfigs` (empty when unknown), `agentsFile` (null when no stable user-scope instructions file), `temp` and `envOverrides` (empty until verified; `relocates` must match the categories under the override's root). All path entries carry `scope` (user/project/system/data), `level` (official/community/inferred), optional `platforms`.

## Code conventions

- ESM-only, no CommonJS. `sideEffects: false` is safe because built-in harnesses are referenced explicitly by the constructor registry.
- All local imports use `.ts` extensions (`import { Harness } from "./harness.ts"`) - required by nodenext moduleResolution.
- `obuild` builds artifacts. `tsgo` is typecheck-only (`noEmit: true`).
- Public API is barrel-driven via `src/index.ts`. Don't export from submodules directly.
- Types from `src/schemas/` are type-only re-exports - no runtime code, no validators.
- Session schema types use `unknown` for fields with unstable upstream shapes. That's intentional - don't add Zod or tighten types without confirming the upstream format is stable.

## Strict TypeScript

tsconfig uses `nodenext` + full strictness:

- `noUncheckedIndexedAccess` - array/map access returns `T | undefined`
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- `verbatimModuleSyntax`, `erasableSyntaxOnly`

Don't weaken these. Fix the code instead.

## Anti-patterns

- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- No provider-specific data shapes in the top-level public API
- No tests that depend on network or external services
- No bypassing `build.config.ts` with ad-hoc build scripts
- Don't commit CLAUDE.md files (gitignored, they're local context-mode config)

## Git

- Don't commit unless explicitly asked
- Don't push unless explicitly asked
- Conventional commits: `feat`/`fix`/`refactor`/`chore`/`test`/`docs`
- Don't force push, don't amend published commits
