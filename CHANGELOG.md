# Changelog


## v0.2.0

[compare changes](https://github.com/agntn/harnesses/compare/v0.1.1...v0.2.0)

### 🩹 Fixes

- **freebuff:** Read version from metadata ([#51](https://github.com/agntn/harnesses/pull/51))
- **mastracode:** Stop detection opening the TUI ([#52](https://github.com/agntn/harnesses/pull/52))

### 📖 Documentation

- PATH scan at the top of the README ([#48](https://github.com/agntn/harnesses/pull/48))

### 🏡 Chore

- **package:** Update `homepage` ([aa15490](https://github.com/agntn/harnesses/commit/aa15490))
- Refresh dependency set ([#49](https://github.com/agntn/harnesses/pull/49))
- ⚠️  Require Node.js 24 ([#50](https://github.com/agntn/harnesses/pull/50))

### 🤖 CI

- Use `--no-git-checks` for pnpm publish ([824abea](https://github.com/agntn/harnesses/commit/824abea))

#### ⚠️ Breaking Changes

- ⚠️  Require Node.js 24 ([#50](https://github.com/agntn/harnesses/pull/50))

### ❤️ Contributors

- Aeitwoen ([@aeitwoen](https://github.com/aeitwoen))
- Ori ([@oritwoen](https://github.com/oritwoen))
- Aei ([@aeitwoen](https://github.com/aeitwoen))

## v0.1.1

[compare changes](https://github.com/agntn/harnesses/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- Register Prime Agent as a harness ([#44](https://github.com/agntn/harnesses/pull/44))

### 🩹 Fixes

- **run:** Stop echoing the prompt to the model ([#45](https://github.com/agntn/harnesses/pull/45))
- **info:** Leave path templates out of the text ([#46](https://github.com/agntn/harnesses/pull/46))
- **docs:** Drop the registry snapshot ([#47](https://github.com/agntn/harnesses/pull/47))

### 🤖 CI

- Build before publish tests, ignore changelog ([#43](https://github.com/agntn/harnesses/pull/43))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))
- Aeitwoen ([@aeitwoen](https://github.com/aeitwoen))

## v0.1.0


### 🚀 Enhancements

- Client registry with detection, schemas, and CLI ([930c3e7](https://github.com/agntn/harnesses/commit/930c3e7))
- Add grok harness ([77418bc](https://github.com/agntn/harnesses/commit/77418bc))
- Add omp harness ([e2c3e77](https://github.com/agntn/harnesses/commit/e2c3e77))
- Add pi harness ([1d3ae1d](https://github.com/agntn/harnesses/commit/1d3ae1d))
- Add freebuff harness ([2e65596](https://github.com/agntn/harnesses/commit/2e65596))
- Add pi and omp extensions ([c70b0ea](https://github.com/agntn/harnesses/commit/c70b0ea))
- Add mcp server ([6eec89d](https://github.com/agntn/harnesses/commit/6eec89d))
- ⚠️  Add normalized harness invocation ([aa31159](https://github.com/agntn/harnesses/commit/aa31159))
- Add structured invocation mode ([a9466b8](https://github.com/agntn/harnesses/commit/a9466b8))
- Add mcp server management ([1669d65](https://github.com/agntn/harnesses/commit/1669d65))
- Add mcp sync ([2d17704](https://github.com/agntn/harnesses/commit/2d17704))
- Add agents file sync ([08dc91d](https://github.com/agntn/harnesses/commit/08dc91d))
- Add Antigravity CLI harness ([4cdb2a7](https://github.com/agntn/harnesses/commit/4cdb2a7))
- Add advisor invocation mode ([9bf5862](https://github.com/agntn/harnesses/commit/9bf5862))
- Expose harness invocation modes ([b26bc31](https://github.com/agntn/harnesses/commit/b26bc31))
- Surface invocation modes across interfaces ([54c9cb8](https://github.com/agntn/harnesses/commit/54c9cb8))
- Add model listing and selection ([b380058](https://github.com/agntn/harnesses/commit/b380058))
- Unify Pi and OMP tool rendering ([#7](https://github.com/agntn/harnesses/pull/7))
- Inspect several harnesses per call ([#14](https://github.com/agntn/harnesses/pull/14))
- Introduce native read-only invocation ([#18](https://github.com/agntn/harnesses/pull/18))
- Sync companion instruction files ([#20](https://github.com/agntn/harnesses/pull/20))
- Expose native media capabilities ([#21](https://github.com/agntn/harnesses/pull/21))
- **pi:** Enable native read-only runs ([#25](https://github.com/agntn/harnesses/pull/25))
- Cancel harness commands with AbortSignal ([#35](https://github.com/agntn/harnesses/pull/35))
- **grok:** Enforce read-only runs with the native sandbox ([#39](https://github.com/agntn/harnesses/pull/39))
- **claude:** Confine read-only runs to Read, Glob and Grep ([#41](https://github.com/agntn/harnesses/pull/41))

### 🩹 Fixes

- Withdraw master mcp servers from excluded harnesses ([b05e7d5](https://github.com/agntn/harnesses/commit/b05e7d5))
- Require explicit harness tool mode ([0f138d4](https://github.com/agntn/harnesses/commit/0f138d4))
- **claude:** Use the real transcript path ([#17](https://github.com/agntn/harnesses/pull/17))
- Preserve prompts in Claude advisor mode ([#19](https://github.com/agntn/harnesses/pull/19))
- Validate companion paths across platforms ([#22](https://github.com/agntn/harnesses/pull/22))
- **agents:** Reject malformed source config ([#23](https://github.com/agntn/harnesses/pull/23))
- Make unsupported JSON runs retryable ([#24](https://github.com/agntn/harnesses/pull/24))
- **copilot:** Detect standalone CLI installs ([#26](https://github.com/agntn/harnesses/pull/26))
- **omp:** Stop treating --no-tools as advisor mode ([#27](https://github.com/agntn/harnesses/pull/27))
- **codex:** Run without a Git repository ([#28](https://github.com/agntn/harnesses/pull/28))
- **run:** Hide stderr after successful runs ([#29](https://github.com/agntn/harnesses/pull/29))
- **mcp:** Mask credentials in list output ([#30](https://github.com/agntn/harnesses/pull/30))
- **pi:** Accept serialized harness info batches ([#32](https://github.com/agntn/harnesses/pull/32))
- **run:** Preserve failed adapter output ([#33](https://github.com/agntn/harnesses/pull/33))
- **invoke:** Stop descendants when commands time out ([#34](https://github.com/agntn/harnesses/pull/34))
- Keep dollar sequences intact in harness inputs ([#38](https://github.com/agntn/harnesses/pull/38))
- Substitute home and project roots verbatim ([#40](https://github.com/agntn/harnesses/pull/40))

### 💅 Refactors

- Replace side-effect client registration with lazy registry ([7b8d150](https://github.com/agntn/harnesses/commit/7b8d150))
- ⚠️  Model clients as class hierarchy ([987f823](https://github.com/agntn/harnesses/commit/987f823))
- ⚠️  Expose client version as getter ([c7043aa](https://github.com/agntn/harnesses/commit/c7043aa))
- ⚠️  Rename package to @agntn/harnesses ([95a6f00](https://github.com/agntn/harnesses/commit/95a6f00))

### 📖 Documentation

- Add harnesses.agntn.dev site ([#36](https://github.com/agntn/harnesses/pull/36))
- Switch badges to npmx.dev ([9c03e79](https://github.com/agntn/harnesses/commit/9c03e79))

### 🏡 Chore

- Pin dev dependency versions ([f6bb42d](https://github.com/agntn/harnesses/commit/f6bb42d))
- Update dependencies ([431c5d3](https://github.com/agntn/harnesses/commit/431c5d3))
- **lint:** Switch to @agntn/ox ([#16](https://github.com/agntn/harnesses/pull/16))

### 🤖 CI

- Restore shared GitHub defaults ([#15](https://github.com/agntn/harnesses/pull/15))

#### ⚠️ Breaking Changes

- ⚠️  Add normalized harness invocation ([aa31159](https://github.com/agntn/harnesses/commit/aa31159))
- ⚠️  Model clients as class hierarchy ([987f823](https://github.com/agntn/harnesses/commit/987f823))
- ⚠️  Expose client version as getter ([c7043aa](https://github.com/agntn/harnesses/commit/c7043aa))
- ⚠️  Rename package to @agntn/harnesses ([95a6f00](https://github.com/agntn/harnesses/commit/95a6f00))

### ❤️ Contributors

- Aei ([@aeitwoen](https://github.com/aeitwoen))
- Aeitwoen ([@aeitwoen](https://github.com/aeitwoen))
- Ori ([@oritwoen](https://github.com/oritwoen))
- Oritwoen ([@oritwoen](https://github.com/oritwoen))

