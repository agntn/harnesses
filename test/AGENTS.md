# Test suite

Scope: Vitest tests for the public API and runtime integrations.

- Test names and fixtures are in English.
- Prefer public interfaces and real local seams; do not depend on network services or installed external harnesses.
- Register cleanup alongside changes to environment, temporary files, timers, or global registry state.
- Invocation tests belong in `invoke.test.ts`; assert exact argument arrays when CLI parsing order is part of the contract.
