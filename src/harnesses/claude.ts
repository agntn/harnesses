import { Harness } from "../harness.ts";

/** The fields of a Claude `stream-json` event the text fold reads; the rest stays unknown. */
interface ClaudeStreamEvent {
  readonly type?: unknown;
  readonly result?: unknown;
  readonly event?: {
    readonly type?: unknown;
    readonly content_block?: { readonly type?: unknown } | null;
    readonly delta?: { readonly type?: unknown; readonly text?: unknown } | null;
  } | null;
}

function parseStreamLine(line: string): ClaudeStreamEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as ClaudeStreamEvent)
      : undefined;
  } catch {
    return undefined;
  }
}

function startsTextBlock(event: ClaudeStreamEvent): boolean {
  return (
    event.type === "stream_event" &&
    event.event?.type === "content_block_start" &&
    event.event.content_block?.type === "text"
  );
}

function textDelta(event: ClaudeStreamEvent): string | undefined {
  if (event.type !== "stream_event" || event.event?.type !== "content_block_delta")
    return undefined;
  const delta = event.event.delta;
  return delta?.type === "text_delta" && typeof delta.text === "string" ? delta.text : undefined;
}

/** Collects one run's events line by line. */
class ClaudeStreamFold {
  /** Text blocks streamed so far, in order. */
  private readonly blocks: string[] = [];
  /** Output lines that are not events. */
  private readonly other: string[] = [];
  private result: string | undefined;

  add(line: string): void {
    if (line.trim().length === 0) return;
    const event = parseStreamLine(line);
    if (!event) {
      this.other.push(line);
      return;
    }
    if (event.type === "result" && typeof event.result === "string") this.result = event.result;
    if (startsTextBlock(event)) this.blocks.push("");
    const text = textDelta(event);
    if (text !== undefined) this.blocks.push((this.blocks.pop() ?? "") + text);
  }

  text(complete: boolean): string {
    const prefix = this.other.map((line) => `${line}\n`).join("");
    if (complete && this.result !== undefined) return `${prefix}${this.result}\n`;
    const text = this.blocks.filter((block) => block.length > 0).join("\n\n");
    return text.length > 0 ? `${prefix}${text}\n` : prefix;
  }
}

/**
 * Folds `claude -p --output-format stream-json --include-partial-messages` back
 * into what plain `claude -p` prints. A finished run takes the `result` event,
 * which carries the same text, errors included. A stopped run has none, so it
 * gets the text blocks streamed so far, one paragraph each. Lines that are not
 * events pass through, except an event the stop cut in half.
 *
 * @param stdout - Captured event output.
 * @param complete - False when a deadline or cancellation stopped the run.
 * @returns {string} The plain text answer, or the part written before the stop.
 */
export function foldClaudeStream(stdout: string, complete: boolean): string {
  const lines = stdout.split("\n");
  // A stop can cut the last event in half, and a whole one always ends in a newline.
  if (!complete && lines.at(-1)?.startsWith("{")) lines.pop();
  const fold = new ClaudeStreamFold();
  for (const line of lines) fold.add(line);
  return fold.text(complete);
}

export default class Claude extends Harness {
  readonly id = "claude";
  readonly name = "Anthropic Claude Code";
  readonly binaries = ["claude"];
  readonly capabilities = {
    mcp: true,
    vision: true,
    audio: false,
    video: false,
    tools: true,
    streaming: true,
  };
  readonly config: Harness["config"] = [
    { path: "~/.claude/settings.json", scope: "user", level: "official" },
    {
      path: "~/.claude.json",
      scope: "user",
      level: "official",
      note: "Global MCP server configurations.",
    },
    {
      path: ".claude/settings.json",
      scope: "project",
      level: "official",
    },
    {
      path: ".claude/settings.local.json",
      scope: "project",
      level: "official",
      note: "Local overrides, typically gitignored.",
    },
    {
      path: ".claude/.mcp.json",
      scope: "project",
      level: "official",
      note: "Project-scoped MCP server configurations.",
    },
    {
      path: "/etc/claude-code/managed-settings.json",
      scope: "system",
      level: "official",
      platforms: ["linux"],
      note: "Enterprise managed settings.",
    },
    {
      path: "/Library/Application Support/ClaudeCode/managed-settings.json",
      scope: "system",
      level: "official",
      platforms: ["darwin"],
      note: "Enterprise managed settings.",
    },
  ];
  readonly sessions: Harness["sessions"] = [
    {
      path: "~/.claude/projects/<dash-encoded-cwd>/*.jsonl",
      scope: "data",
      level: "official",
      note: "Per-project session transcripts in JSONL format.",
    },
    {
      path: "~/.claude/history.jsonl",
      scope: "data",
      level: "official",
      note: "Global prompt history across all projects.",
    },
  ];
  readonly persistence: Harness["persistence"] = [
    { format: "JSON", level: "official", note: "Settings and MCP config files." },
    {
      format: "JSONL",
      level: "official",
      note: "Session transcripts and global history.",
    },
  ];
  readonly instructions: Harness["instructions"] = [
    { path: "CLAUDE.md", scope: "project", level: "official" },
    {
      path: ".claude/CLAUDE.md",
      scope: "project",
      level: "official",
      note: "Alternative project-level location.",
    },
    {
      path: "~/.claude/CLAUDE.md",
      scope: "user",
      level: "official",
      note: "Global user-level instructions.",
    },
  ];
  readonly skills: Harness["skills"] = [
    { path: ".claude/skills/", scope: "project", level: "official" },
    {
      path: "~/.claude/skills/",
      scope: "user",
      level: "official",
      note: "Global user-level skills.",
    },
  ];
  readonly commands: Harness["commands"] = [
    {
      path: ".claude/commands/",
      scope: "project",
      level: "official",
      note: "Legacy slash commands, merged into skills.",
    },
    {
      path: "~/.claude/commands/",
      scope: "user",
      level: "official",
      note: "Legacy global slash commands.",
    },
  ];
  override readonly promptTemplates = this.commands;
  override readonly promptTemplateSyncTarget: Harness["promptTemplateSyncTarget"] = {
    path: "~/.claude/commands/",
    scope: "user",
    level: "official",
    format: "markdown",
  };
  readonly hooks: Harness["hooks"] = [
    { path: ".claude/hooks/", scope: "project", level: "official" },
    {
      path: "~/.claude/hooks/",
      scope: "user",
      level: "official",
      note: "Global user-level hooks.",
    },
  ];
  readonly invocation: Harness["invocation"] = {
    args: ["-p", "{prompt}"],
    jsonArgs: ["-p", "--output-format", "json", "{prompt}"],
    noToolsArgs: ["-p", "{prompt}", "--strict-mcp-config", "--tools", ""],
    noToolsJsonArgs: [
      "-p",
      "--output-format",
      "json",
      "{prompt}",
      "--strict-mcp-config",
      "--tools",
      "",
    ],
    readOnlyArgs: ["-p", "{prompt}", "--strict-mcp-config", "--tools", "Read,Glob,Grep"],
    readOnlyJsonArgs: [
      "-p",
      "--output-format",
      "json",
      "{prompt}",
      "--strict-mcp-config",
      "--tools",
      "Read,Glob,Grep",
    ],
    readOnlyMinVersion: "2.1.175",
    modelArgs: ["--model", "{model}"],
    streamArgs: ["--output-format", "stream-json", "--verbose", "--include-partial-messages"],
    level: "official",
    note: "Headless print mode; add --output-format json for structured output. Plain text runs stream events instead and fold them back, since text mode prints nothing until the answer is complete and a timeout would lose all of it; --include-partial-messages streams a single long answer too, checked on 2.1.280. --tools only covers the built-in set, so every mode without the full agent adds --strict-mcp-config to drop configured MCP servers too; without it an advisor still sees every user and project MCP tool, checked on 2.1.280. Read-only runs keep the built-in Read, Glob and Grep tools, so no write tool exists whatever permission mode the settings carry; verified on 2.1.175 and 2.1.268. --permission-mode plan does not qualify: its shell commands run through the auto mode classifier, which let a file write through.",
  };
  override readonly mcpConfigs: Harness["mcpConfigs"] = [
    {
      path: "~/.claude.json",
      scope: "user",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
    {
      path: ".mcp.json",
      scope: "project",
      level: "official",
      format: "json",
      key: ["mcpServers"],
      dialect: "standard",
    },
  ];
  override readonly agentsFile = "~/.claude/CLAUDE.md";
  readonly detection = {
    envVars: ["CLAUDE_CODE", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CONFIG_DIR"],
    projectMarkers: [
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".claude/skills",
      "CLAUDE.md",
    ],
  };

  protected override foldStreamOutput(stdout: string, complete: boolean): string {
    return foldClaudeStream(stdout, complete);
  }
}
