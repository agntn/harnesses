/** Tool parameter schemas, built by `src/tools.ts` and the CLI's `mcp-servers add`. */

import { Type, type TProperties } from "@agntn/tools";

export const HARNESS_INFO_MAX_ITEMS = 20;
export const RUN_TIMEOUT_DEFAULT_SECONDS = 600;

/** Same UUID rule as `invoke`, so a session name or prefix never gets this far. */
const SESSION_UUID =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/**
 * Builds every harness tool's schema, the one place its input type comes from.
 *
 * @returns {Record<string, TObject>} Schemas keyed by harness tool operation.
 */
export function harnessToolSchemas() {
  const harnessId = (description: string) =>
    Type.String({ description, minLength: 1, maxLength: 50, pattern: "^[a-z][a-z0-9-]*$" });

  const stringRecord = (description: string) =>
    Type.Record(Type.String({ maxLength: 256 }), Type.String({ maxLength: 4096 }), {
      description,
    });

  /**
   * A closed object rejects a stray `read_only` instead of quietly running with every tool.
   *
   * @param properties - Declared tool arguments.
   * @returns {TObject<P>} An object schema that refuses undeclared keys.
   */
  const closed = <const P extends TProperties>(properties: P) =>
    Type.Object(properties, { additionalProperties: false });

  const scope = Type.Optional(
    Type.Enum(["user", "project"], {
      description: "Which config file to target (default user)",
    }),
  );

  return {
    /** Open on purpose: nothing to misread, and some models send a placeholder `_` here. */
    detect: Type.Object({}),
    info: closed({
      id: Type.Union(
        [
          harnessId("Harness id"),
          Type.Array(harnessId("Harness id"), {
            minItems: 1,
            maxItems: HARNESS_INFO_MAX_ITEMS,
          }),
        ],
        { description: "Harness id, or a list of ids to inspect in one call" },
      ),
    }),
    models: closed({
      id: harnessId("Harness id"),
      search: Type.Optional(
        Type.String({
          description:
            "Optional model search filter; without a native one, ids match ignoring case",
          minLength: 1,
          maxLength: 1024,
        }),
      ),
      cwd: Type.Optional(
        Type.String({
          description: "Working directory used while loading harness configuration",
          minLength: 1,
          maxLength: 4096,
        }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          description: `Wall-clock budget in seconds (default ${RUN_TIMEOUT_DEFAULT_SECONDS})`,
          minimum: 1,
          maximum: 3600,
        }),
      ),
    }),
    run: closed({
      id: harnessId("Harness id"),
      prompt: Type.String({
        description: "Prompt to send to the harness",
        minLength: 1,
        maxLength: 100000,
      }),
      cwd: Type.Optional(
        Type.String({
          description: "Working directory for the run",
          minLength: 1,
          maxLength: 4096,
        }),
      ),
      model: Type.Optional(
        Type.String({
          description: "Harness-native model id or selector",
          minLength: 1,
          maxLength: 512,
        }),
      ),
      effort: Type.Optional(
        Type.String({
          description:
            "Reasoning effort in the harness's own words, such as low or high. Harnesses without effortSelection in harnesses_info reject it.",
          minLength: 1,
          maxLength: 32,
          pattern: "^[a-z]+$",
        }),
      ),
      extensions: Type.Optional(
        Type.Boolean({
          description:
            "Set false to start Pi or OMP without extension discovery, so a broken extension can't stop the run. Harnesses without extensionsOptional in harnesses_info reject it. A run that died on an extension says retry with extensions: false.",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description:
            "Full session UUID to continue, as the harness printed it: Claude session_id, Codex thread_id, OMP session id. Harnesses without sessionResume in harnesses_info reject it.",
          minLength: 36,
          maxLength: 36,
          pattern: SESSION_UUID,
        }),
      ),
      sessionId: Type.Optional(
        Type.String({
          description:
            "UUID for a new session that a later run resumes. Harnesses without sessionIdSelection in harnesses_info reject it.",
          minLength: 36,
          maxLength: 36,
          pattern: SESSION_UUID,
        }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          description: `Wall-clock budget in seconds (default ${RUN_TIMEOUT_DEFAULT_SECONDS})`,
          minimum: 1,
          maximum: 3600,
        }),
      ),
      structured: Type.Optional(
        Type.Boolean({
          description: "Use the harness's structured (JSON) output mode instead of plain text",
        }),
      ),
      tools: Type.Boolean({
        description:
          "Explicit execution mode. Set true when the task needs any harness tools, including Grok native X search. Set false only for an advisor without tools.",
      }),
      readOnly: Type.Optional(
        Type.Boolean({
          description:
            "Set with tools=true to require native read-only tool enforcement. Unsupported harnesses reject the run instead of widening access. The sandbox can also cut the network of what the harness starts, MCP servers included: when readOnlyNetwork in harnesses_info is false, MCP tools that need the web fail in that run. When readOnlyTools there is a list, the run keeps only those tools, without any extension or MCP tool.",
        }),
      ),
    }),
    mcpList: closed({
      id: Type.Optional(harnessId("Harness id; omit to list every harness")),
      name: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: 100,
          description:
            "Server name; keeps only servers with exactly this name and drops configs and harnesses without one. Unreadable configs stay, since they might hold it",
        }),
      ),
    }),
    mcpSync: closed({
      id: Type.Optional(harnessId("Harness id; omit to sync every harness")),
      check: Type.Optional(
        Type.Boolean({ description: "Report what would change without writing anything" }),
      ),
    }),
    agentsSync: closed({
      id: Type.Optional(harnessId("Harness id; omit to sync every harness")),
      check: Type.Optional(
        Type.Boolean({ description: "Report what would change without writing anything" }),
      ),
    }),
    promptsSync: closed({
      id: Type.Optional(harnessId("Harness id; omit to sync every harness")),
      check: Type.Optional(
        Type.Boolean({ description: "Report what would change without writing anything" }),
      ),
    }),
    skillsSync: closed({
      id: Type.Optional(harnessId("Harness id; omit to sync every harness")),
      check: Type.Optional(
        Type.Boolean({ description: "Report what would change without writing anything" }),
      ),
    }),
    mcpAdd: closed({
      id: harnessId("Harness id"),
      name: Type.String({
        description: "Server name",
        minLength: 1,
        maxLength: 100,
        pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$",
      }),
      command: Type.Optional(
        Type.String({ description: "Binary for a stdio server", minLength: 1, maxLength: 4096 }),
      ),
      args: Type.Optional(
        Type.Array(Type.String({ maxLength: 4096 }), {
          description: "Arguments for a stdio server",
          maxItems: 64,
        }),
      ),
      env: Type.Optional(stringRecord("Environment variables for a stdio server")),
      url: Type.Optional(
        Type.String({ description: "URL for an http/sse server", minLength: 1, maxLength: 4096 }),
      ),
      transport: Type.Optional(
        Type.Enum(["stdio", "http", "sse"], {
          description: "Transport; inferred from url/command when omitted",
        }),
      ),
      headers: Type.Optional(stringRecord("Headers for an http/sse server")),
      scope,
    }),
    mcpRemove: closed({
      id: harnessId("Harness id"),
      name: Type.String({
        description: "Server name",
        minLength: 1,
        maxLength: 100,
      }),
      scope,
    }),
  };
}
