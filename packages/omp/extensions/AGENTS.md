# OMP extension

Scope: the distributable OMP extension adapter and its TUI renderers.

- Reuse shared schemas and executors; this file owns only OMP registration, approval level, and rendering.
- Treat spawned harness commands as `exec`, even when their logical result is read-only.
- Sanitize every external value before rendering it in the terminal.
