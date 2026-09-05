/**
 * Writes app/data/harnesses.json from the built library.
 * The library spawns processes and reads the filesystem, so it stays out of the browser bundle;
 * the site reads this snapshot instead. Run after `pnpm build` in the repo root.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAllHarnesses, version } from "../../dist/index.mjs";

const out = fileURLToPath(new URL("../app/data/harnesses.json", import.meta.url));

const harnesses = getAllHarnesses().map((harness) => ({
  id: harness.id,
  name: harness.name,
  binaries: harness.binaries,
  capabilities: harness.capabilities,
  invocation: harness.invocation,
  invocationModes: harness.invocationModes,
  modelListing: harness.modelListing,
  config: harness.config,
  sessions: harness.sessions,
  persistence: harness.persistence,
  instructions: harness.instructions,
  skills: harness.skills,
  commands: harness.commands,
  hooks: harness.hooks,
  mcpConfigs: harness.mcpConfigs,
  agentsFile: harness.agentsFile,
  detection: harness.detection,
}));

writeFileSync(out, `${JSON.stringify({ version, harnesses }, null, 2)}\n`);
console.log(`${harnesses.length} harnesses, library ${version} -> ${out}`);
