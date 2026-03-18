import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type {
  ClientDefinition,
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

const SUPPORTED_PLATFORMS = new Set<string>(["linux", "darwin", "win32"]);

export class Client {
  readonly id: ClientId;
  readonly name: string;
  readonly binaries: string[];
  readonly config: PathCandidate[];
  readonly sessions: PathCandidate[];
  readonly persistence: StorageDescriptor[];
  readonly instructions: PathCandidate[];
  readonly skills: PathCandidate[];
  readonly commands: PathCandidate[];
  readonly hooks: PathCandidate[];
  readonly capabilities: ClientCapabilities;
  readonly detection: ClientDetection;

  constructor(definition: ClientDefinition) {
    this.id = definition.id;
    this.name = definition.name;
    this.binaries = definition.binaries;
    this.config = definition.config;
    this.sessions = definition.sessions;
    this.persistence = definition.persistence;
    this.instructions = definition.instructions;
    this.skills = definition.skills;
    this.commands = definition.commands;
    this.hooks = definition.hooks;
    this.capabilities = definition.capabilities;
    this.detection = definition.detection ?? { envVars: [], projectMarkers: [] };
  }

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

    if (!SUPPORTED_PLATFORMS.has(raw)) {
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
