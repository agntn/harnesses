/**
 * Tool parameter schemas shared by every surface (MCP server, Pi and OMP
 * extensions). Each surface owns a different TypeBox build (the extensions
 * must use their host's facade), so the schemas are a factory over a minimal
 * structural builder instead of importing typebox here.
 */

/**
 * The subset of the TypeBox builder the tool schemas need. `I` is the schema
 * type the builder accepts as input, `S` the (possibly narrower) type it
 * returns; OMP's facade accepts its own `AnySchema` while producing schemas
 * that satisfy the host's stricter `TSchema`.
 */
export interface McpSchemaBuilder<I, S> {
  Object(properties: Record<string, I>, options?: object): S;
  String(options?: object): I;
  Integer(options?: object): I;
  Boolean(options?: object): I;
  Array(item: I, options?: object): I;
  Record(key: I, value: I, options?: object): I;
  Union(schemas: I[], options?: object): I;
  Literal(value: string, options?: object): I;
  Optional(schema: I): I;
}

export const RUN_TIMEOUT_DEFAULT_SECONDS = 600;

/** Builds the parameter schemas for all harness tools with the host's TypeBox. */
export function harnessToolSchemas<I, S>(Type: McpSchemaBuilder<I, S>) {
  const harnessId = (description: string) =>
    Type.String({ description, minLength: 1, maxLength: 50, pattern: "^[a-z][a-z0-9-]*$" });

  const stringRecord = (description: string) =>
    Type.Record(Type.String({ maxLength: 256 }), Type.String({ maxLength: 4096 }), {
      description,
    });

  const scope = Type.Optional(
    Type.Union([Type.Literal("user"), Type.Literal("project")], {
      description: "Which config file to target (default user)",
    }),
  );

  return {
    detect: Type.Object({}),
    info: Type.Object({ id: harnessId("Harness id") }),
    run: Type.Object({
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
    }),
    mcpList: Type.Object({
      id: Type.Optional(harnessId("Harness id; omit to list every harness")),
    }),
    mcpSync: Type.Object({
      id: Type.Optional(harnessId("Harness id; omit to sync every harness")),
    }),
    agentsSync: Type.Object({
      id: Type.Optional(harnessId("Harness id; omit to sync every harness")),
      check: Type.Optional(
        Type.Boolean({ description: "Report what would change without writing anything" }),
      ),
    }),
    mcpAdd: Type.Object({
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
        Type.Union([Type.Literal("stdio"), Type.Literal("http"), Type.Literal("sse")], {
          description: "Transport; inferred from url/command when omitted",
        }),
      ),
      headers: Type.Optional(stringRecord("Headers for an http/sse server")),
      scope,
    }),
    mcpRemove: Type.Object({
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

/**
 * Parameter types matching the schemas above. The generic factory erases the
 * builders' literal types, so hosts annotate their execute callbacks with
 * these instead of TypeBox Static inference.
 */
export interface InfoParams {
  id: string;
}

export interface RunParams {
  id: string;
  prompt: string;
  cwd?: string;
  timeoutSeconds?: number;
  structured?: boolean;
}

export interface McpListParams {
  id?: string;
}

export interface McpSyncParams {
  id?: string;
}

export interface AgentsSyncParams {
  id?: string;
  check?: boolean;
}

export interface McpAddParams {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: "stdio" | "http" | "sse";
  headers?: Record<string, string>;
  scope?: "user" | "project";
}

export interface McpRemoveParams {
  id: string;
  name: string;
  scope?: "user" | "project";
}
