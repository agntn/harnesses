export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export interface ClaudeThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | unknown[];
  is_error: boolean;
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock;

export interface ClaudeUsage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface ClaudeBaseEntry {
  uuid: string;
  timestamp: string;
  sessionId: string;
  parentUuid: string | null;
  isSidechain: boolean;
  userType: "external" | "ant";
  cwd: string;
  version: string;
  gitBranch: string;
}

export interface ClaudeUserEntry extends ClaudeBaseEntry {
  type: "user";
  message: {
    role: "user";
    content: string | ClaudeContentBlock[];
  };
  isMeta?: boolean;
  toolUseResult?: {
    stdout: string;
    stderr: string;
    interrupted: boolean;
    isImage: boolean;
  };
}

export interface ClaudeAssistantEntry extends ClaudeBaseEntry {
  type: "assistant";
  requestId: string;
  message: {
    id: string;
    role: "assistant";
    type: "message";
    model: string;
    content: ClaudeContentBlock[];
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: ClaudeUsage;
  };
}

export interface ClaudeSummaryEntry {
  type: "summary";
  summary: string;
  leafUuid: string;
}

export type ClaudeSessionEntry = ClaudeUserEntry | ClaudeAssistantEntry | ClaudeSummaryEntry;

export interface ClaudeHistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
  pastedContents: Record<
    string,
    {
      id: number;
      type: "text";
      content: string;
    }
  >;
}
