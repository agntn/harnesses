export interface GeminiTokensSummary {
  input: number;
  output: number;
  cached: number;
  thoughts?: number;
  tool?: number;
  total: number;
}

export interface GeminiToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown[] | null;
  status: "success" | "error" | "running";
  timestamp: string;
  displayName?: string;
  renderOutputAsMarkdown?: boolean;
}

export interface GeminiThought {
  subject: string;
  description: string;
  timestamp: string;
}

export interface GeminiMessageRecord {
  id: string;
  timestamp: string;
  type: "user" | "gemini" | "info" | "error" | "warning";
  content: unknown[];
  displayContent?: unknown[];
  model?: string;
  tokens?: GeminiTokensSummary;
  thoughts?: GeminiThought[];
  toolCalls?: GeminiToolCallRecord[];
}

export interface GeminiConversationRecord {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessageRecord[];
  summary?: string;
  directories?: string[];
  kind?: "main" | "subagent";
}
