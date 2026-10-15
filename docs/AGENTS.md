# docs/

Cloudflare Workers Builds deploys this site to harnesses.agntn.dev with root directory `docs` and build command `pnpm run build`. It installs `docs/` alone, so the root `node_modules` and `dist/` never exist there, and it takes Node.js from the root `.node-version`, never from `engines`.

Resources on the Cloudflare account, bound by id in `wrangler.jsonc`:

- D1 `agntn-harnesses` as `DB` for Nuxt Content, plus a separate D1 for preview builds
- No KV, R2 or secrets: nothing is fetched at runtime
