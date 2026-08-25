import { defineBuildConfig } from "obuild/config";

/**
 * One bundle, three inputs: the entries share their chunks and therefore any
 * module-level state. Separate bundles would each carry their own copy of the
 * harness registry, so a harness registered through the package entrypoint
 * would be invisible to the tool operations (and vice versa).
 */
export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts", "./src/tool-operations.ts"],
    },
  ],
});
