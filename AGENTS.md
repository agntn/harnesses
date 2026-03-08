# PROJECT KNOWLEDGE BASE

## OVERVIEW

`aixa` is an agnostic metadata toolkit for AI tools and CLIs. It aims to normalize differences between ecosystems (Codex, Gemini, Claude, OpenCode, and others) by exposing one TypeScript API for binary names, config locations, session storage paths, and persistence formats.

## STRUCTURE

```text
src/
|- index.ts                # Public API barrel
test/
`- index.test.ts           # Basic contract tests
.github/workflows/
|- test.yml                # CI: typecheck -> build -> test
`- release.yml             # Publish to npm on v* tags
build.config.ts            # obuild config
```

## WHERE TO LOOK

| Task                   | Location                           | Notes                                   |
| ---------------------- | ---------------------------------- | --------------------------------------- |
| Add public API         | `src/index.ts`                     | Keep exports small and stable           |
| Add tests              | `test/`                            | Mirror public behavior, not internals   |
| Change package outputs | `build.config.ts` + `package.json` | Keep `entries` and `exports` aligned    |
| CI changes             | `.github/workflows/test.yml`       | Keep order `typecheck -> build -> test` |
| Release changes        | `.github/workflows/release.yml`    | Trigger only on `v*` tags               |

## CONVENTIONS

- ESM-only package, no CommonJS output
- `obuild` builds artifacts; `tsgo --noEmit --skipLibCheck` is typecheck-only
- Public API is barrel-driven via `src/index.ts`
- Vitest uses globals
- Start minimal dependencies and add only when needed by real features

## ANTI-PATTERNS

- Do not add `as any`, `@ts-ignore`, or placeholder unsafe typing
- Do not leak provider-specific data shapes into top-level public API
- Do not bypass `build.config.ts` by writing ad-hoc build scripts
- Do not make tests depend on external network services by default

## COMMANDS

```bash
pnpm install
pnpm lint
pnpm fmt
pnpm typecheck
pnpm build
pnpm test:run
pnpm release
```
