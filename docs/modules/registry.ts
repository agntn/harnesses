import { addTemplate, defineNuxtModule } from "nuxt/kit";
import { getAllHarnesses } from "../../src/registry.ts";
import { version } from "../../src/types.ts";
import type { HarnessRecord } from "../shared/types/registry.ts";

/**
 * Ships the registry as `#harnesses-registry`, one typed template Nuxt bundles. The library spawns
 * processes and reads files, so it stays out of the browser and the worker; this runs it once, in
 * Node, when Nuxt starts. The registry subgraph of `src/` has no third-party import, which is what
 * lets Workers Builds skip installing the repo root.
 */
export default defineNuxtModule({
  meta: { name: "harnesses-registry" },
  setup(_options, nuxt) {
    const harnesses: HarnessRecord[] = getAllHarnesses().map((harness) => ({
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
      promptTemplates: harness.promptTemplates,
      hooks: harness.hooks,
      mcpConfigs: harness.mcpConfigs,
      agentsFile: harness.agentsFile,
      detection: harness.detection,
    }));

    const template = addTemplate({
      filename: "harnesses-registry.ts",
      write: true,
      getContents: () => {
        const data = JSON.stringify({ version, harnesses });
        return [
          `import type { HarnessRecord } from "#shared/types/registry";`,
          `const registry: { version: string; harnesses: HarnessRecord[] } = ${data};`,
          "export default registry;",
          "",
        ].join("\n");
      },
    });
    nuxt.options.alias["#harnesses-registry"] = template.dst;
  },
});
