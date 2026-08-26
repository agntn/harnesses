# Pi extension

Scope: the distributable Pi extension adapter.

- Reuse schemas and executors from `src/tool-schemas.ts` and `src/tool-operations.ts`; do not fork business logic here.
- Register every shared read or execution capability exposed by the package tools.
- Keep result types sourced from built declarations and preserve lazy executor loading.
