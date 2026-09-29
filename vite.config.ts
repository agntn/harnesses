import oxfmt from "@agntn/ox/oxfmt";
import oxlint from "@agntn/ox/oxlint";
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
  },
  fmt: { ...oxfmt, ignorePatterns: ["dist", "coverage", "docs", "CHANGELOG.md"] },
  lint: {
    ...oxlint,
    rules: {
      ...oxlint.rules,
      /** Existing public and host DTOs stay mutable for source compatibility. */
      "typescript/prefer-readonly-parameter-types": [
        "error",
        {
          allow: [
            {
              from: "file",
              name: [
                "AgentsConfig",
                "AgentsSyncParams",
                "Harness",
                "HarnessInfoResult",
                "HarnessInvocation",
                "InfoParams",
                "InvokeOptions",
                "InvokeResult",
                "ListModelsOptions",
                "McpAddParams",
                "McpConfigFile",
                "McpConfigListing",
                "McpListParams",
                "McpRemoveParams",
                "McpSchemaBuilder",
                "McpServerConfig",
                "McpServerParams",
                "McpSyncParams",
                "ModelsOptions",
                "ModelsOutcome",
                "ModelsParams",
                "RenderedToolResult",
                "RenderOptions",
                "ResolveOptions",
                "RunFailure",
                "RunOptions",
                "RunParams",
                "StatusTheme",
                "ToolResult",
              ],
            },
            { from: "lib", name: ["AbortSignal", "ReadonlyMap", "ReadonlySet"] },
            {
              from: "package",
              name: "ExtensionAPI",
              package: "@earendil-works/pi-coding-agent",
            },
            {
              from: "package",
              name: ["ExtensionAPI", "ToolDefinition"],
              package: "@oh-my-pi/pi-coding-agent",
            },
          ],
          ignoreInferredTypes: true,
        },
      ],
    },
    ignorePatterns: ["dist", "coverage", "docs"],
  },
  /**
   * One bundle, five inputs: the entries share their chunks and therefore any
   * module-level state. Separate bundles would each carry their own copy of the
   * harness registry, so a harness registered through the package entrypoint
   * would be invisible to the tool operations (and vice versa). Chunks keep the
   * stable `_chunks/<name>.mjs` names obuild gave them, which
   * `test/mcp-loading.test.ts` matches to tell which modules a call loaded.
   */
  pack: {
    entry: {
      index: "src/index.ts",
      cli: "src/cli.ts",
      mcp: "src/mcp.ts",
      "tool-operations": "src/tool-operations.ts",
      "tool-schemas": "src/tool-schemas.ts",
    },
    dts: true,
    format: "esm",
    platform: "node",
    sourcemap: true,
    hash: false,
    outputOptions: {
      chunkFileNames: "_chunks/[name].mjs",
      /* JSDoc ships once, in the declarations; the runtime files keep only legal and annotation comments. */
      comments: { jsdoc: false },
    },
    /**
     * typebox stays inline: resolving and parsing it from node_modules costs the
     * MCP server more at every spawn than the bundled copy does.
     */
    deps: {
      onlyBundle: [/^typebox(?:\/|$)/u],
      alwaysBundle: [/^typebox(?:\/|$)/u],
    },
    /* The inlined typebox carries no license header of its own, so its MIT notice ships beside it. */
    copy: [{ from: "node_modules/typebox/license", rename: "typebox.LICENSE" }],
  },
});
