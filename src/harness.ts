import { addAbortListener } from "node:events";
import { existsSync, statSync } from "node:fs";
import { execFile, execFileSync, spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type {
  HarnessDetection,
  HarnessId,
  HarnessInvocation,
  HarnessInvocationModes,
  HarnessModelListing,
  InvokeOptions,
  InvokeResult,
  ListModelsOptions,
  ListModelsResult,
  AvailableModel,
  McpConfigFile,
  PathCandidate,
  PromptTemplateSyncTarget,
  StorageDescriptor,
  HarnessCapabilities,
  ResolveOptions,
  ResolvedPaths,
  Platform,
} from "./types.ts";
import { resolvePathTemplate } from "./resolve.ts";

const SUPPORTED_PLATFORMS: Record<Platform, true> = {
  linux: true,
  darwin: true,
  win32: true,
};

type CommandOptions = Readonly<{
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

type InvocationOptions = Readonly<{
  model?: string;
  structured?: boolean;
  tools?: boolean;
  readOnly?: boolean;
}>;

type InvocationMode = keyof HarnessInvocationModes;

const ALTERNATE_INVOCATION_MODE: Partial<Record<InvocationMode, InvocationMode>> = {
  advisor: "agent",
  advisorStructured: "agentStructured",
  agent: "advisor",
  agentStructured: "advisorStructured",
};

const INVOCATION_MODE_DESCRIPTION: Record<InvocationMode, string> = {
  advisor: "advisor without tools",
  advisorStructured: "structured (JSON) advisor without tools",
  readOnly: "read-only full agent",
  readOnlyStructured: "structured (JSON) read-only full agent",
  agent: "full agent",
  agentStructured: "structured (JSON) full agent",
};

const INVOCATION_RETRY_HINT: Partial<Record<InvocationMode, string>> = {
  advisor: "; retry with tools: true to start its full agent",
  advisorStructured: "; retry with tools: true to start its full agent",
  agent: "; retry with tools: false to use its advisor without tools",
  agentStructured: "; retry with tools: false to use its advisor without tools",
};

function requestedInvocationMode(options: InvocationOptions): InvocationMode {
  if (options.readOnly === true) {
    return options.structured === true ? "readOnlyStructured" : "readOnly";
  }
  if (options.tools === true) return options.structured === true ? "agentStructured" : "agent";
  return options.structured === true ? "advisorStructured" : "advisor";
}

/**
 * Explains an explicit `tools: false` beside `readOnly: true`, or returns null.
 * Read-only access still hands the harness tools, so the pair is rejected
 * instead of one flag silently overriding the other.
 *
 * @param id - Harness id for the message.
 * @param invocation - Templates that decide which retries are offered.
 * @param options - Requested execution mode.
 * @returns {string | null} The conflict with its executable retries, or null.
 */
function accessConflictError(
  id: string,
  invocation: HarnessInvocation,
  options: InvocationOptions,
): string | null {
  if (options.readOnly !== true || options.tools !== false) return null;

  const retries: string[] = [];
  if (invocationTemplate(invocation, requestedInvocationMode(options))) {
    retries.push("tools: true to keep its read-only tools");
  }
  if (invocationTemplate(invocation, requestedInvocationMode({ ...options, readOnly: false }))) {
    retries.push("readOnly: false to use its advisor without tools");
  }
  const error = `Harness ${id} cannot run readOnly with tools: false, since read-only access still uses tools`;
  return retries.length === 0 ? error : `${error}; retry with ${retries.join(", or with ")}`;
}

function invocationTemplate(
  invocation: HarnessInvocation,
  mode: InvocationMode,
): readonly string[] | undefined {
  switch (mode) {
    case "advisor":
      return invocation.noToolsArgs;
    case "advisorStructured":
      return invocation.noToolsJsonArgs;
    case "readOnly":
      return invocation.readOnlyArgs;
    case "readOnlyStructured":
      return invocation.readOnlyJsonArgs;
    case "agent":
      return invocation.args;
    case "agentStructured":
      return invocation.jsonArgs;
  }
}

function invocationRetryHint(
  invocation: HarnessInvocation,
  mode: InvocationMode,
  options: InvocationOptions,
): string {
  const withoutStructured = requestedInvocationMode({ ...options, structured: false });
  if (options.structured === true) {
    if (invocationTemplate(invocation, withoutStructured)) {
      return "; retry with structured: false";
    }
    const alternateWithoutStructured = ALTERNATE_INVOCATION_MODE[withoutStructured];
    if (
      alternateWithoutStructured !== undefined &&
      invocationTemplate(invocation, alternateWithoutStructured)
    ) {
      return `; retry with structured: false and tools: ${!options.tools}`;
    }
  }

  const alternateMode = ALTERNATE_INVOCATION_MODE[mode];
  const alternateAvailable =
    alternateMode === undefined ? undefined : invocationTemplate(invocation, alternateMode);
  return alternateAvailable ? (INVOCATION_RETRY_HINT[mode] ?? "") : "";
}

/**
 * Orders two dotted versions numerically; a pre-release tag sorts below its release.
 *
 * @param a - Left version.
 * @param b - Right version.
 * @returns {number} Negative when a is older, positive when newer, zero when equal.
 */
function compareVersions(a: string, b: string): number {
  const [aBase = "", aPre] = a.split("-", 2);
  const [bBase = "", bPre] = b.split("-", 2);
  const left = aBase.split(".").map(Number);
  const right = bBase.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return Number(aPre === undefined) - Number(bPre === undefined);
}

function buildInvocationArgs(
  template: readonly string[],
  prompt: string,
  modelArgs: readonly string[] | undefined,
  model: string | undefined,
): string[] {
  const args = template.map((arg) => arg.replaceAll("{prompt}", () => prompt));
  if (model !== undefined && modelArgs) {
    args.push(...modelArgs.map((arg) => arg.replaceAll("{model}", () => model)));
  }
  return args;
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

/**
 * Keep escalation alive even when the root exits before its descendants.
 * @param pid - Root of the command's process group or Windows tree.
 */
async function terminateCommand(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      execFile(
        join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
        ["/PID", String(pid), "/T", "/F"],
        { windowsHide: true, timeout: 2000, killSignal: "SIGKILL" },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return;
  }

  signalProcessGroup(pid, "SIGTERM");
  await delay(500);
  signalProcessGroup(pid, "SIGKILL");
}

/**
 * Tells a missing cwd from a missing binary, both `spawn <command> ENOENT` from Node.
 *
 * @param command - Command that was spawned.
 * @param cwd - Working directory passed to the spawn, if any.
 * @param error - Error thrown by `spawn` or emitted by the child.
 * @returns {unknown} The error with a message that names the cause, keeping its `code`.
 */
function spawnError(command: string, cwd: string | undefined, error: unknown): unknown {
  if (!(error instanceof Error && "code" in error)) return error;
  if (error.code !== "ENOENT" && error.code !== "ENOTDIR") return error;
  let message: string;
  if (cwd !== undefined && !isDirectory(cwd)) {
    message = existsSync(cwd)
      ? `Working directory is not a directory: ${cwd}`
      : `Working directory not found: ${cwd}`;
  } else if (error.code === "ENOENT") {
    message = `Command not found: ${command}. Install it or add it to PATH`;
  } else {
    return error;
  }
  return Object.assign(new Error(message, { cause: error }), { code: error.code });
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function executeCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<InvokeResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let stopped: "timeout" | "abort" | undefined;
    let lastOutputAt = performance.now();
    let idleMs: number | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: ReturnType<typeof addAbortListener> | undefined;

    if (options.signal?.aborted) {
      stopped = "abort";
      finish(null);
      return;
    }

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached:
          process.platform !== "win32" &&
          (Boolean(options.timeoutMs) || options.signal !== undefined),
      });
    } catch (error) {
      fail(spawnError(command, options.cwd, error));
      return;
    }

    if (options.timeoutMs) timer = setTimeout(() => stop("timeout"), options.timeoutMs);
    if (options.signal) abortListener = addAbortListener(options.signal, () => stop("abort"));

    // A stream decoder keeps a multibyte character split across two chunks whole.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      lastOutputAt = performance.now();
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      lastOutputAt = performance.now();
    });
    child.on("error", (error) => fail(spawnError(command, options.cwd, error)));
    child.on("close", (code) => {
      if (stopped === undefined) finish(code);
    });

    function cleanup(): void {
      if (timer) clearTimeout(timer);
      abortListener?.[Symbol.dispose]();
    }

    function fail(error: unknown): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function stop(reason: "timeout" | "abort"): void {
      if (settled || stopped !== undefined) return;
      stopped = reason;
      idleMs = Math.round(performance.now() - lastOutputAt);
      cleanup();
      if (child.pid === undefined) return;
      void terminateCommand(child.pid).then(
        () => {
          child.stdout.destroy();
          child.stderr.destroy();
          finish(null);
        },
        (error: unknown) => {
          child.stdout.destroy();
          child.stderr.destroy();
          fail(error);
        },
      );
    }

    function finish(code: number | null): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        command,
        args: [...args],
        stdout,
        stderr,
        exitCode: stopped === undefined ? code : null,
        timedOut: stopped === "timeout",
        aborted: stopped === "abort",
        ...(idleMs === undefined ? {} : { idleMs }),
      });
    }
  });
}

export abstract class Harness {
  abstract readonly id: HarnessId;
  abstract readonly name: string;
  abstract readonly binaries: string[];
  abstract readonly config: PathCandidate[];
  abstract readonly sessions: PathCandidate[];
  abstract readonly persistence: StorageDescriptor[];
  abstract readonly instructions: PathCandidate[];
  abstract readonly skills: PathCandidate[];
  abstract readonly commands: PathCandidate[];
  /** Reusable prompt files; empty when no CLI template location is verified. */
  readonly promptTemplates: PathCandidate[] = [];
  /** Stable user-scope destination used by prompt template synchronization. */
  readonly promptTemplateSyncTarget: PromptTemplateSyncTarget | null = null;
  abstract readonly hooks: PathCandidate[];
  abstract readonly capabilities: HarnessCapabilities;
  abstract readonly detection: HarnessDetection;
  /** Non-interactive invocation recipe; null when the harness has no headless mode. */
  abstract readonly invocation: HarnessInvocation | null;
  /** Native model-listing recipe; null when the harness cannot enumerate available models. */
  readonly modelListing: HarnessModelListing | null = null;
  /** Config files that hold MCP server definitions; empty when unknown or unsupported. */
  readonly mcpConfigs: McpConfigFile[] = [];
  /**
   * The user-scope global instructions file this harness reads, as a path
   * template; null when there is no stable file (or another harness's file
   * covers it via vendor compatibility).
   */
  readonly agentsFile: string | null = null;

  isInstalled(): boolean {
    const cmd = process.platform === "win32" ? "where" : "which";
    return this.binaries.some((binary) => {
      try {
        execFileSync(cmd, [binary], { stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    });
  }

  detectEnv(): boolean {
    return this.detection.envVars.some((v) => !!process.env[v]);
  }

  detectProject(cwd?: string): boolean {
    const dir = cwd ?? process.cwd();
    return this.detection.projectMarkers.some((marker) => existsSync(join(dir, marker)));
  }

  get version(): string | null {
    for (const binary of this.binaries) {
      try {
        const output = execFileSync(binary, ["--version"], {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        });
        const match = output.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
        if (match?.[1]) return match[1];
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Invocation modes available without fallback or prompt-only restrictions.
   *
   * @returns {HarnessInvocationModes} The exact supported invocation modes.
   */
  get invocationModes(): HarnessInvocationModes {
    return {
      advisor: this.invocation?.noToolsArgs !== undefined,
      advisorStructured: this.invocation?.noToolsJsonArgs !== undefined,
      readOnly: this.invocation?.readOnlyArgs !== undefined,
      readOnlyStructured: this.invocation?.readOnlyJsonArgs !== undefined,
      agent: this.invocation?.args !== undefined,
      agentStructured: this.invocation?.jsonArgs !== undefined,
    };
  }

  /**
   * Expands the invocation template for one prompt, without spawning anything.
   * Returns null when the harness has no headless mode, or no structured mode
   * when `structured` is requested.
   *
   * @param prompt - Prompt inserted into the invocation template.
   * @param options - Requested model and execution mode.
   * @returns {{ command: string, args: string[] } | null} The executable invocation, or null.
   */
  buildInvocation(
    prompt: string,
    options: InvocationOptions = {},
  ): { command: string; args: string[] } | null {
    if (!this.invocation) return null;
    const command = this.invocation.binary ?? this.binaries[0];
    if (!command) return null;
    if (options.model !== undefined && !this.invocation.modelArgs) return null;
    if (accessConflictError(this.id, this.invocation, options) !== null) return null;
    const template = invocationTemplate(this.invocation, requestedInvocationMode(options));
    if (!template) return null;
    return {
      command,
      args: buildInvocationArgs(template, prompt, this.invocation.modelArgs, options.model),
    };
  }

  /**
   * Explains why an invocation option set cannot be built, or returns null when supported.
   *
   * @param options - Requested model and execution mode.
   * @returns {string | null} The incompatibility reason, or null when supported.
   */
  invocationError(options: InvocationOptions = {}): string | null {
    if (!this.invocation) return `Harness ${this.id} has no non-interactive invocation`;
    if (options.model !== undefined && !this.invocation.modelArgs) {
      return `Harness ${this.id} does not support model selection`;
    }
    const conflict = accessConflictError(this.id, this.invocation, options);
    if (conflict !== null) return conflict;
    const mode = requestedInvocationMode(options);
    if (invocationTemplate(this.invocation, mode)) return null;

    const error = `Harness ${this.id} has no ${INVOCATION_MODE_DESCRIPTION[mode]} invocation`;
    return `${error}${invocationRetryHint(this.invocation, mode, options)}`;
  }

  /**
   * Runs one prompt through the harness non-interactively and collects the
   * output. stdin is closed so a harness that falls back to interactive mode
   * exits instead of waiting forever.
   *
   * @param prompt - Prompt sent to the harness.
   * @param options - Invocation, environment, timeout, and cancellation options.
   * @returns {Promise<InvokeResult>} The completed process result.
   */
  invoke(prompt: string, options: InvokeOptions = {}): Promise<InvokeResult> {
    const invocationOptions = {
      model: options.model,
      structured: options.structured,
      tools: options.tools,
      readOnly: options.readOnly,
    };
    const built = this.buildInvocation(prompt, invocationOptions);
    if (!built) {
      return Promise.reject(
        new Error(this.invocationError(invocationOptions) ?? "Invalid invocation"),
      );
    }
    const versionError = this.readOnlyVersionError(invocationOptions);
    if (versionError) return Promise.reject(new Error(versionError));

    const streamArgs = options.structured ? undefined : this.invocation?.streamArgs;
    if (!streamArgs) return executeCommand(built.command, built.args, options);
    return executeCommand(built.command, [...built.args, ...streamArgs], options).then(
      (result) => ({
        ...result,
        stdout: this.foldStreamOutput(result.stdout, !result.timedOut && !result.aborted),
      }),
    );
  }

  /**
   * Turns the events a `streamArgs` run printed back into the text the plain
   * run would have printed.
   *
   * @param _stdout - Event output as captured, possibly cut short.
   * @param _complete - False when a deadline or cancellation stopped the run.
   * @returns {string} The answer text, or what the model had written so far.
   */
  protected foldStreamOutput(_stdout: string, _complete: boolean): string {
    throw new Error(`Harness ${this.id} does not implement stream output folding`);
  }

  /**
   * Explains why the installed CLI cannot run a read-only recipe that carries a
   * version floor, or returns null when no floor applies or the installed
   * version meets it. An unknown version fails closed, like a missing recipe.
   *
   * @param options - Requested execution mode.
   * @returns {string | null} The version incompatibility, or null when the run may proceed.
   */
  private readOnlyVersionError(options: InvocationOptions): string | null {
    const floor = this.invocation?.readOnlyMinVersion;
    if (floor === undefined || options.readOnly !== true) return null;
    const installed = this.version;
    const error = `Harness ${this.id} requires version ${floor} or newer for read-only runs`;
    if (installed === null) return `${error}; installed version unknown`;
    if (compareVersions(installed, floor) < 0) return `${error}; installed ${installed}`;
    return null;
  }

  /**
   * Expands the native model-listing recipe without spawning anything.
   *
   * @param search - Optional model search filter; without native `searchArgs` it is applied
   *   to the parsed output instead, so the command is the unfiltered one.
   * @returns {{ command: string, args: string[] } | null} The command, or null when unsupported.
   */
  buildModelListInvocation(search?: string): { command: string; args: string[] } | null {
    if (!this.modelListing) return null;
    const command = this.binaries[0];
    if (!command) return null;
    const template =
      search === undefined
        ? this.modelListing.args
        : (this.modelListing.searchArgs ?? this.modelListing.args);
    return {
      command,
      args: template.map((arg) => arg.replaceAll("{search}", () => search ?? "")),
    };
  }

  /**
   * Runs the harness's native model-listing command and normalizes its output.
   * stdin is closed for the same reason as {@link invoke}.
   *
   * @param options - Search, environment, timeout, and cancellation options.
   * @returns {Promise<ListModelsResult>} The normalized command and model result.
   */
  async listModels(options: ListModelsOptions = {}): Promise<ListModelsResult> {
    const built = this.buildModelListInvocation(options.search);
    if (!built) throw new Error(`Harness ${this.id} does not support model listing`);

    const result = await executeCommand(built.command, built.args, options);
    if (result.timedOut || result.aborted || result.exitCode !== 0)
      return { ...result, models: [] };

    const models = this.parseModelListingOutput(result.stdout);
    if (options.search === undefined || this.modelListing?.searchArgs) return { ...result, models };
    const search = options.search.toLowerCase();
    return { ...result, models: models.filter((model) => model.id.toLowerCase().includes(search)) };
  }

  /**
   * Converts a successful native model-listing response to the shared shape.
   *
   * @param _stdout - Native command output to parse.
   */
  protected parseModelListingOutput(_stdout: string): AvailableModel[] {
    throw new Error(`Harness ${this.id} does not implement model-list output parsing`);
  }

  /**
   * Filters one candidate list to the platform and expands its path
   * templates: the shared pipeline behind {@link resolve} and the MCP
   * config surface.
   *
   * @param entries - Candidate paths to filter and resolve.
   * @param options - Platform and path-resolution overrides.
   * @returns {T[]} Resolved candidates supported on the selected platform.
   */
  resolveCandidates<T extends PathCandidate>(
    entries: readonly T[],
    options: ResolveOptions = {},
  ): T[] {
    const raw = options.platform ?? process.platform;

    if (!Object.hasOwn(SUPPORTED_PLATFORMS, raw)) {
      throw new Error(`Unsupported platform: ${raw}. Expected one of: linux, darwin, win32`);
    }

    const platform = raw as Platform;

    return entries
      .filter((entry) => !entry.platforms || entry.platforms.includes(platform))
      .map((entry) => ({ ...entry, path: resolvePathTemplate(entry.path, options) }));
  }

  resolve(options: ResolveOptions = {}): ResolvedPaths {
    return {
      config: this.resolveCandidates(this.config, options),
      sessions: this.resolveCandidates(this.sessions, options),
      instructions: this.resolveCandidates(this.instructions, options),
      skills: this.resolveCandidates(this.skills, options),
      commands: this.resolveCandidates(this.commands, options),
      promptTemplates: this.resolveCandidates(this.promptTemplates, options),
      promptTemplateSyncTarget:
        this.promptTemplateSyncTarget === null
          ? null
          : (this.resolveCandidates([this.promptTemplateSyncTarget], options)[0] ?? null),
      hooks: this.resolveCandidates(this.hooks, options),
    };
  }
}

export type HarnessConstructor = new () => Harness;
