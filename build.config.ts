import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  entries: [
    {
      /** One bundle, so the entries share one harness registry instead of each holding its own copy. */
      type: "bundle",
      input: [
        "./src/index.ts",
        "./src/cli.ts",
        "./src/mcp.ts",
        "./src/tool-operations.ts",
        "./src/tools.ts",
      ],
      /** Declaration maps would point at a src/ the tarball doesn't carry. */
      dts: { sourcemap: false },
    },
  ],
});
