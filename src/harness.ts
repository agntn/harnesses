import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
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

function executeCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<InvokeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : undefined;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ command, args, stdout, stderr, exitCode: timedOut ? null : code, timedOut });
    });
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

  /** Invocation modes available without fallback or prompt-only restrictions. */
  get invocationModes(): HarnessInvocationModes {
    return {
      advisor: this.invocation?.noToolsArgs !== undefined,
      advisorStructured: this.invocation?.noToolsJsonArgs !== undefined,
      agent: this.invocation?.args !== undefined,
      agentStructured: this.invocation?.jsonArgs !== undefined,
    };
  }

  /**
   * Expands the invocation template for one prompt, without spawning anything.
   * Returns null when the harness has no headless mode, or no structured mode
   * when `structured` is requested.
   */
  buildInvocation(
    prompt: string,
    options: { model?: string; structured?: boolean; tools?: boolean } = {},
  ): { command: string; args: string[] } | null {
    if (!this.invocation) return null;
    const command = this.invocation.binary ?? this.binaries[0];
    if (!command) return null;
    if (options.model !== undefined && !this.invocation.modelArgs) return null;
    const tools = options.tools ?? false;
    const template = tools
      ? options.structured
        ? this.invocation.jsonArgs
        : this.invocation.args
      : options.structured
        ? this.invocation.noToolsJsonArgs
        : this.invocation.noToolsArgs;
    if (!template) return null;
    const args = template.map((arg) => arg.replaceAll("{prompt}", prompt));
    const model = options.model;
    if (model !== undefined && this.invocation.modelArgs) {
      args.push(...this.invocation.modelArgs.map((arg) => arg.replaceAll("{model}", model)));
    }
    return { command, args };
  }

  /** Explains why an invocation option set cannot be built, or returns null when supported. */
  invocationError(
    options: { model?: string; structured?: boolean; tools?: boolean } = {},
  ): string | null {
    if (!this.invocation) return `Harness ${this.id} has no non-interactive invocation`;
    if (options.model !== undefined && !this.invocation.modelArgs) {
      return `Harness ${this.id} does not support model selection`;
    }
    const tools = options.tools ?? false;
    const available = tools
      ? options.structured
        ? this.invocation.jsonArgs
        : this.invocation.args
      : options.structured
        ? this.invocation.noToolsJsonArgs
        : this.invocation.noToolsArgs;
    if (available) return null;
    return tools
      ? `Harness ${this.id} has no${options.structured ? " structured (JSON)" : ""} full agent invocation`
      : `Harness ${this.id} has no${options.structured ? " structured (JSON)" : ""} advisor without tools invocation`;
  }

  /**
   * Runs one prompt through the harness non-interactively and collects the
   * output. stdin is closed so a harness that falls back to interactive mode
   * exits instead of waiting forever.
   */
  invoke(prompt: string, options: InvokeOptions = {}): Promise<InvokeResult> {
    const invocationOptions = {
      model: options.model,
      structured: options.structured,
      tools: options.tools,
    };
    const built = this.buildInvocation(prompt, invocationOptions);
    if (!built) {
      return Promise.reject(
        new Error(this.invocationError(invocationOptions) ?? "Invalid invocation"),
      );
    }

    return executeCommand(built.command, built.args, options);
  }

  /** Expands the native model-listing recipe without spawning anything. */
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
   */
  async listModels(options: ListModelsOptions = {}): Promise<ListModelsResult> {
    const built = this.buildModelListInvocation(options.search);
    if (!built) {
      return Promise.reject(
        new Error(
          this.modelListing
            ? `Harness ${this.id} does not support filtering its model listing`
            : `Harness ${this.id} does not support model listing`,
        ),
      );
    }

    const result = await executeCommand(built.command, built.args, options);
    return {
      ...result,
      models:
        !result.timedOut && result.exitCode === 0
          ? this.parseModelListingOutput(result.stdout)
          : [],
    };
  }

  /** Converts a successful native model-listing response to the shared shape. */
  protected parseModelListingOutput(_stdout: string): AvailableModel[] {
    throw new Error(`Harness ${this.id} does not implement model-list output parsing`);
  }

  /**
   * Filters one candidate list to the platform and expands its path
   * templates: the shared pipeline behind {@link resolve} and the MCP
   * config surface.
   */
  resolveCandidates<T extends PathCandidate>(entries: T[], options: ResolveOptions = {}): T[] {
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
