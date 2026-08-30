# CLI command adapters

Scope: Citty command definitions under `src/commands/`.

- Keep commands thin: parse protocol input here; put reusable behavior in `src/tool-operations.ts`, `src/mcp-servers.ts`, or `src/agents-sync.ts`.
- Preserve machine-readable output through the shared format/result helpers; sanitize human-facing text before writing it.
- Keep option defaults and validation aligned with the MCP and extension tool surfaces.
- Add command-specific tests at the observable CLI/result boundary rather than mocking modules.
