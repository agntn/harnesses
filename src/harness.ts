import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import type {
  HarnessDetection,
  HarnessId,
  HarnessInvocation,
  InvokeOptions,
  InvokeResult,
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
   * Expands the invocation template for one prompt, without spawning anything.
   * Returns null when the harness has no headless mode, or no structured mode
   * when `structured` is requested.
   */
  buildInvocation(
    prompt: string,
    options: { structured?: boolean } = {},
  ): { command: string; args: string[] } | null {
    if (!this.invocation) return null;
    const command = this.invocation.binary ?? this.binaries[0];
    if (!command) return null;
    const template = options.structured ? this.invocation.jsonArgs : this.invocation.args;
    if (!template) return null;
    return {
      command,
      args: template.map((arg) => arg.replaceAll("{prompt}", prompt)),
    };
  }

  /**
   * Runs one prompt through the harness non-interactively and collects the
   * output. stdin is closed so a harness that falls back to interactive mode
   * exits instead of waiting forever.
   */
  invoke(prompt: string, options: InvokeOptions = {}): Promise<InvokeResult> {
    const built = this.buildInvocation(prompt, { structured: options.structured });
    if (!built) {
      return Promise.reject(
        new Error(
          options.structured && this.invocation
            ? `Harness ${this.id} has no structured (JSON) invocation`
            : `Harness ${this.id} has no non-interactive invocation`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const child = spawn(built.command, built.args, {
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
        resolve({
          command: built.command,
          args: built.args,
          stdout,
          stderr,
          exitCode: timedOut ? null : code,
          timedOut,
        });
      });
    });
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
