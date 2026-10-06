import type { BuildConfig } from "obuild";
import { defineBuildConfig } from "obuild/config";

/** typebox is an optional peer, and the MCP server starts faster with it inline than resolved from node_modules. */
const bundleTypebox: NonNullable<BuildConfig["hooks"]> = {
  rolldownConfig(config) {
    const external = config.external;
    const isTypebox = (id: string): boolean => /^typebox(?:\/|$)/u.test(id);

    if (typeof external === "function") {
      config.external = (id, importer, isResolved) =>
        isTypebox(id) ? false : external(id, importer, isResolved);
      return;
    }

    if (Array.isArray(external)) {
      config.external = external.filter((item) =>
        typeof item === "string" ? !isTypebox(item) : !item.test("typebox/value"),
      );
    }
  },
};

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
        "./src/tool-schemas.ts",
      ],
      /** Declaration maps would point at a src/ the tarball doesn't carry. */
      dts: { sourcemap: false },
    },
  ],
  hooks: bundleTypebox,
});
