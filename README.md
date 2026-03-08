# aixa

[![npm version][npm-version-src]][npm-version-href]
[![License][license-src]][license-href]

Agnostic metadata toolkit for AI tools: binaries, configs, sessions, and storage formats.

## Purpose

`aixa` is a tool-agnostic layer for AI CLIs and assistants (for example Codex, Gemini, Claude, OpenCode). It provides one normalized model for:

- binary names and executable locations
- config file locations and structure
- session storage locations and formats
- runtime metadata needed by higher-level libraries

The goal is to let other packages query and invoke tool data without re-implementing every integration from scratch.

## Install

```bash
pnpm add aixa
```

## Usage

```ts
import { version } from "aixa";

console.log(version);
```

## License

[MIT](./LICENSE)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/aixa?style=flat
[npm-version-href]: https://npmjs.com/package/aixa
[license-src]: https://img.shields.io/npm/l/aixa?style=flat
[license-href]: https://github.com/oritwoen/aixa/blob/main/LICENSE
