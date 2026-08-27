import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import type {
  HarnessDetection,
  HarnessId,
  HarnessInvocation,
  InvokeOptions,
  InvokeResult,
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

/** Default grace period in milliseconds after SIGTERM before escalating to SIGKILL. */
export const DEFAULT_KILL_GRACE_PERIOD_MS = 500;

/** Terminates an entire process tree across supported platforms. */
export function terminateProcessTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      try {
        process.kill(pid, signal);
      } catch {}
    }
  } else {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {}
    }
  }
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

    if (options.signal?.aborted) {
      return Promise.resolve({
        command: built.command,
        args: built.args,
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
        aborted: true,
      });
    }

    return new Promise((resolve, reject) => {
      const child = spawn(built.command, built.args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let aborted = false;
      let graceTimer: NodeJS.Timeout | undefined;

      const terminate = () => {
        if (!child.pid || child.killed) return;
        terminateProcessTree(child.pid, "SIGTERM");
        const graceMs = options.killGracePeriodMs ?? DEFAULT_KILL_GRACE_PERIOD_MS;
        if (graceMs > 0) {
          graceTimer = setTimeout(() => {
            if (!child.pid || child.exitCode !== null) return;
            terminateProcessTree(child.pid, "SIGKILL");
          }, graceMs);
        } else {
          terminateProcessTree(child.pid, "SIGKILL");
        }
      };

      const timer = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            terminate();
          }, options.timeoutMs)
        : undefined;

      const onAbort = () => {
        aborted = true;
        terminate();
      };

      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (graceTimer) clearTimeout(graceTimer);
        if (options.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        cleanup();
        reject(error);
      });
      child.on("close", (code) => {
        cleanup();
        resolve({
          command: built.command,
          args: built.args,
          stdout,
          stderr,
          exitCode: timedOut || aborted ? null : code,
          timedOut,
          aborted,
        });
      });
    });
  }

  resolve(options: ResolveOptions = {}): ResolvedPaths {
    const raw = options.platform ?? process.platform;

    if (!Object.hasOwn(SUPPORTED_PLATFORMS, raw)) {
      throw new Error(`Unsupported platform: ${raw}. Expected one of: linux, darwin, win32`);
    }

    const platform = raw as Platform;

    const matchesPlatform = (entry: PathCandidate) =>
      !entry.platforms || entry.platforms.includes(platform);

    const resolveEntry = (entry: PathCandidate): PathCandidate => ({
      ...entry,
      path: resolvePathTemplate(entry.path, options),
    });

    return {
      config: this.config.filter(matchesPlatform).map(resolveEntry),
      sessions: this.sessions.filter(matchesPlatform).map(resolveEntry),
      instructions: this.instructions.filter(matchesPlatform).map(resolveEntry),
      skills: this.skills.filter(matchesPlatform).map(resolveEntry),
      commands: this.commands.filter(matchesPlatform).map(resolveEntry),
      hooks: this.hooks.filter(matchesPlatform).map(resolveEntry),
    };
  }
}

export type HarnessConstructor = new () => Harness;
