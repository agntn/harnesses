import { addAbortListener } from "node:events";
import { existsSync } from "node:fs";
import { execFile, execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
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

function buildInvocationArgs(
  template: readonly string[],
  prompt: string,
  modelArgs: readonly string[] | undefined,
  model: string | undefined,
): string[] {
  const args = template.map((arg) => arg.replaceAll("{prompt}", prompt));
  if (model !== undefined && modelArgs) {
    args.push(...modelArgs.map((arg) => arg.replaceAll("{model}", model)));
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

function executeCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<InvokeResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let stopped: "timeout" | "abort" | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: ReturnType<typeof addAbortListener> | undefined;

    if (options.signal?.aborted) {
      stopped = "abort";
      finish(null);
      return;
    }

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached:
        process.platform !== "win32" &&
        (Boolean(options.timeoutMs) || options.signal !== undefined),
    });

    if (options.timeoutMs) timer = setTimeout(() => stop("timeout"), options.timeoutMs);
    if (options.signal) abortListener = addAbortListener(options.signal, () => stop("abort"));

    /* oxlint-disable-next-line typescript/prefer-readonly-parameter-types */
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    /* oxlint-disable-next-line typescript/prefer-readonly-parameter-types */
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", fail);
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

    return executeCommand(built.command, built.args, options);
  }

  /**
   * Expands the native model-listing recipe without spawning anything.
   *
   * @param search - Optional native model search filter.
   * @returns {{ command: string, args: string[] } | null} The command, or null when unsupported.
   */
  buildModelListInvocation(search?: string): { command: string; args: string[] } | null {
    if (!this.modelListing) return null;
    const command = this.binaries[0];
    if (!command) return null;
    const template = search === undefined ? this.modelListing.args : this.modelListing.searchArgs;
    if (!template) return null;
    return {
      command,
      args: template.map((arg) => arg.replaceAll("{search}", search ?? "")),
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
    if (!built) {
      throw new Error(
        this.modelListing
          ? `Harness ${this.id} does not support filtering its model listing`
          : `Harness ${this.id} does not support model listing`,
      );
    }

    const result = await executeCommand(built.command, built.args, options);
    return {
      ...result,
      models:
        !result.timedOut && !result.aborted && result.exitCode === 0
          ? this.parseModelListingOutput(result.stdout)
          : [],
    };
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
      hooks: this.resolveCandidates(this.hooks, options),
    };
  }
}

export type HarnessConstructor = new () => Harness;
