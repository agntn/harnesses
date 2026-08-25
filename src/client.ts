import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type {
  ClientDetection,
  ClientId,
  PathCandidate,
  StorageDescriptor,
  ClientCapabilities,
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

export abstract class Client {
  abstract readonly id: ClientId;
  abstract readonly name: string;
  abstract readonly binaries: string[];
  abstract readonly config: PathCandidate[];
  abstract readonly sessions: PathCandidate[];
  abstract readonly persistence: StorageDescriptor[];
  abstract readonly instructions: PathCandidate[];
  abstract readonly skills: PathCandidate[];
  abstract readonly commands: PathCandidate[];
  abstract readonly hooks: PathCandidate[];
  abstract readonly capabilities: ClientCapabilities;
  abstract readonly detection: ClientDetection;

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

  getVersion(): string | null {
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

export type ClientConstructor = new () => Client;
