import { Harness } from "../harness.ts";
import { parsePiModelTable } from "./pi.ts";
import type { AvailableModel } from "../types.ts";

export default class PrimeAgent extends Harness {
  readonly id = "prime-agent";
  readonly name = "Prime Agent";
  readonly binaries = ["prime-agent"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    {
      path: "~/.prime/agent/settings.json",
      scope: "user",
      level: "official",
      note: "Config dir overridable with PRIME_AGENT_CODING_AGENT_DIR.",
    },
    { path: ".prime/agent/settings.json", scope: "project", level: "official" },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.prime/agent/sessions/<session-id>.jsonl",
      scope: "data",
      level: "official",
      note: "Flat directory of JSONL transcripts whose header records the working directory; session ids are UUIDv7. Overridable with PRIME_AGENT_SESSION_DIR or --session-dir.",
    },
    {
      path: "~/.prime/agent/session-artifacts/<session-id>/",
      scope: "data",
      level: "official",
      note: "Per-session Python kernel state, scheduled jobs, harness state and child session transcripts under sub-<id>/.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    {
      format: "JSON",
      level: "official",
      note: "Settings, auth, telemetry, model cache and session artifact state files.",
    },
    {
      format: "JSONL",
      level: "official",
      note: "Session transcripts, the RLM spawn ledger and structured logs.",
    },
    {
      format: "dill",
      level: "official",
      note: "Pickled Python REPL state (kernel-state.dill) in session artifacts.",
    },
  ];
  readonly instructions: Harness["instructions"] = [
    {
      path: "AGENTS.md",
      scope: "project",
      level: "official",
      note: "Loaded from parent directories and cwd; CLAUDE.md accepted as an alternative.",
    },
    {
      path: ".prime/agent/SYSTEM.md",
      scope: "project",
      level: "official",
      note: "Replaces the default system prompt; APPEND_SYSTEM.md appends instead.",
    },
    {
      path: "~/.prime/agent/AGENTS.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions; CLAUDE.md accepted as an alternative.",
    },
    {
      path: "~/.prime/agent/SYSTEM.md",
      scope: "user",
      level: "official",
      note: "Global system prompt replacement; APPEND_SYSTEM.md appends instead.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".prime/agent/skills/", scope: "project", level: "official" },
    {
      path: ".agents/skills/",
      scope: "project",
      level: "official",
      note: "Also scanned in ancestor directories up to the Git repository root; root .md files are ignored there.",
    },
    {
      path: "~/.prime/agent/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
    {
      path: "~/.agents/skills/",
      scope: "user",
      level: "official",
      note: "Shared skills directory; root .md files are ignored there.",
    },
  ];
  readonly commands: Harness["commands"] = [
    {
      path: ".prime/agent/prompts/",
      scope: "project",
      level: "official",
      note: "Prompt templates invoked as slash commands.",
    },
    {
      path: "~/.prime/agent/prompts/",
      scope: "user",
      level: "official",
      note: "Global user-level prompt templates.",
    },
  ];
  readonly hooks: Harness["hooks"] = [];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "--mode", "json", "{prompt}"],
    noToolsArgs: ["-p", "--no-tools", "{prompt}"],
    noToolsJsonArgs: ["-p", "--no-tools", "--mode", "json", "{prompt}"],
    modelArgs: ["--model", "{model}"],
    level: "official",
    note: "Add --mode json for structured event output. No read-only mode: the only built-in tool is a Python REPL and the worker and kernel processes are not a security sandbox.",
  };
  override readonly modelListing: Harness["modelListing"] = {
    args: ["model", "list"],
    searchArgs: ["model", "list", "{search}"],
    level: "official",
    note: "Lists models with configured provider authentication; accepts an optional fuzzy search. --list-models was removed.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.prime/agent/settings.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
      note: 'prime-agent mcp add/remove manage this map; project settings entries are ignored for execution. Stdio env values must be {"env": "NAME"} references, which the standard dialect drops on read; literal env values written through it are rejected by the kernel at connect time.',
    },
  ];
  override readonly agentsFile = "~/.prime/agent/AGENTS.md";
  readonly detection = {
    envVars: ["PRIME_AGENT_KERNEL_OWNER_PID"],
    projectMarkers: [".prime/agent"],
  };

  protected override parseModelListingOutput(stdout: string): AvailableModel[] {
    return parsePiModelTable(stdout, "Prime Agent");
  }
}
