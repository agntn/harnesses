import "./clients/index.ts";

export { version } from "./types.ts";
export type {
  ClientId,
  EvidenceLevel,
  Platform,
  PathCandidate,
  StorageDescriptor,
  ClientCapabilities,
  ClientDetection,
  ClientDefinition,
  ResolveOptions,
  ResolvedPaths,
} from "./types.ts";

export { Client } from "./client.ts";
export {
  defineClient,
  getClient,
  listClients,
  getAllClients,
  detectClient,
  detectClientFromEnv,
  detectProjectClients,
} from "./registry.ts";
export { resolvePathTemplate } from "./resolve.ts";

export type {
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeThinkingBlock,
  ClaudeToolUseBlock,
  ClaudeToolResultBlock,
  ClaudeUsage,
  ClaudeBaseEntry,
  ClaudeUserEntry,
  ClaudeAssistantEntry,
  ClaudeSummaryEntry,
  ClaudeSessionEntry,
  ClaudeHistoryEntry,
  GeminiTokensSummary,
  GeminiToolCallRecord,
  GeminiThought,
  GeminiMessageRecord,
  GeminiConversationRecord,
  CodexHistoryEntry,
  CodexThread,
  CodexLogEntry,
  OpenCodeSession,
  OpenCodeMessage,
  OpenCodeTextPart,
  OpenCodeReasoningPart,
  OpenCodeToolPart,
  OpenCodeFilePart,
  OpenCodeSubtaskPart,
  OpenCodeStepStartPart,
  OpenCodeStepFinishPart,
  OpenCodeSnapshotPart,
  OpenCodePatchPart,
  OpenCodeAgentPart,
  OpenCodeRetryPart,
  OpenCodeCompactionPart,
  OpenCodePart,
  OpenCodeTodo,
  OpenCodeProject,
} from "./schemas/index.ts";

import type { ClientId } from "./types.ts";
import { listClients } from "./registry.ts";

export const clientIds: readonly ClientId[] = Object.freeze(listClients());
