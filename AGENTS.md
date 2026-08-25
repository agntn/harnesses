# @agntn/harnesses

Metadata registry for AI coding harnesses. Paths, formats, detection rules, session schemas - one TypeScript API covering Claude Code, Codex, Gemini, Grok, OpenCode, Cursor, GitHub Copilot, Mastra Code, OMP, and Pi.

## Commands

```bash
pnpm install              # install deps
pnpm lint                 # oxlint + oxfmt check
pnpm lint:fix             # auto-fix lint/format
pnpm typecheck            # tsgo --noEmit --skipLibCheck
pnpm build                # obuild (library + CLI)
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
  harness.ts            # abstract Harness class (resolve, detect, isInstalled, version)
  registry.ts           # global Map<HarnessId, Harness>, detect functions
  resolve.ts            # path template expansion (~, ${HOME}, %ENVVAR%)
  cli.ts                # citty CLI (list, detect, info, paths)
  harnesses/
    index.ts            # constructor registry for all built-in harnesses
    claude.ts           # one file per harness implementation
    codex.ts
    gemini.ts
    opencode.ts
    cursor.ts
    github-copilot.ts
    mastracode.ts
  schemas/
    index.ts            # type-only re-exports for session formats
    claude.ts           # ClaudeSessionEntry, ClaudeUserEntry, etc.
    codex.ts            # CodexThread, CodexLogEntry, etc.
    gemini.ts           # GeminiConversationRecord, etc.
    opencode.ts         # OpenCodeSession, OpenCodeMessage, OpenCodePart, etc.
test/
  index.test.ts         # all tests in one file, covers registry + detection + resolution
build.config.ts         # obuild entries: src/index + src/cli
```

## Adding a new harness

1. Add the ID to `HarnessId` union in `src/types.ts`
2. Create `src/harnesses/<name>.ts` with a concrete class extending `Harness`
3. Import it in `src/harnesses/index.ts`
4. Add a row in `README.md` agents table
5. Update the harness ID list in `test/index.test.ts` (`should expose stable harness ids`)
6. Run `pnpm lint && pnpm typecheck && pnpm build && pnpm test:run`

Each harness class has: `config`, `sessions`, `persistence`, `instructions`, `skills`, `commands`, `hooks`, `capabilities`, `detection`. All path entries carry `scope` (user/project/system/data), `level` (official/community/inferred), optional `platforms`.

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
