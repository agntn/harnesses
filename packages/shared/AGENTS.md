# Shared extension UI

Scope: framework-neutral rendering shared by the Pi and OMP extension adapters.

- Keep terminal text sanitized before it reaches either harness component.
- Return plain strings and structural data here. Pi and OMP own their component imports and renderer signatures.
- Keep collapsed status lines bounded. Tool output still belongs to the model-facing result.
