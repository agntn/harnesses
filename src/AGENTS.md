# Core source

Scope: public types, base harness behavior, registry-backed operations, CLI, and MCP surfaces in `src/`.

- Keep the library API, CLI, shared tool operations, MCP registration, and exported declarations aligned.
- Provider-specific parsing belongs in the owning `src/harnesses/<id>.ts` adapter.
- Expected unsupported capabilities must fail explicitly; do not represent them as successful empty results.
- Public API changes require tests and README examples.
- Preserve the shared build bundle topology in `build.config.ts`.
