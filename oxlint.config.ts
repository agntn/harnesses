import { defineConfig } from "oxlint";
import oxlint from "@agntn/ox/oxlint";

export default defineConfig({
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
  ignorePatterns: ["dist", "coverage"],
});
