# docs/

Cloudflare Workers Builds deploys this site to harnesses.agntn.dev with root directory `docs` and build command `pnpm run build`. Its install there fills the whole root workspace from the root `pnpm-lock.yaml`, but `dist/` never exists, and it takes Node.js from the root `.node-version`, never from `engines`.

The build trigger only watches `docs/*`, `src/*`, `CHANGELOG.md` and `.node-version`. A bump that touches nothing but the catalog in the root `pnpm-workspace.yaml` and `pnpm-lock.yaml` leaves the live site on the old versions until the next commit in one of those paths.

Resources on the Cloudflare account, bound by id in `wrangler.jsonc`:

- D1 `agntn-harnesses` as `DB` for Nuxt Content, plus a separate D1 for preview builds
- No KV, R2 or secrets: nothing is fetched at runtime
