import { defineBuildConfig } from "obuild/config";

/**
 * One bundle, four inputs: the entries share their chunks and therefore any
 * module-level state. Separate bundles would each carry their own copy of the
 * harness registry, so a harness registered through the package entrypoint
 * would be invisible to the tool operations (and vice versa).
 */
export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: [
        "./src/index.ts",
        "./src/cli.ts",
        "./src/mcp.ts",
        "./src/tool-operations.ts",
        "./src/tool-schemas.ts",
      ],
    },
  ],
  hooks: {
    // typebox stays inline: resolving and parsing it from node_modules costs the
    // MCP server more at every spawn than the bundled copy does. obuild marks
    // every dependency and peer dependency external, so the entries the default
    // adds for typebox are filtered back out here.
    rolldownConfig(config) {
      const externals = Array.isArray(config.external) ? config.external : [];
      config.external = externals.filter(
        (entry) => entry !== "typebox" && !(entry instanceof RegExp && entry.test("typebox/value")),
      );
    },
  },
});
