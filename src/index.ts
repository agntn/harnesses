export { version } from "./types.ts";
export type {
  HarnessId,
  EvidenceLevel,
  Platform,
  PathCandidate,
  StorageDescriptor,
  HarnessCapabilities,
  HarnessDetection,
  HarnessInvocation,
  HarnessInvocationModes,
  HarnessModelListing,
  AvailableModel,
  ListModelsOptions,
  ListModelsResult,
  InvokeOptions,
  InvokeResult,
  McpServerConfig,
  McpConfigFile,
  ResolveOptions,
  ResolvedPaths,
} from "./types.ts";

export { Harness } from "./harness.ts";
export type { HarnessConstructor } from "./harness.ts";
export {
  registerHarness,
  getHarness,
  isHarnessId,
  listHarnesses,
  getAllHarnesses,
  detectHarness,
  detectHarnessFromEnv,
  detectProjectHarnesses,
} from "./registry.ts";
export { resolvePathTemplate } from "./resolve.ts";
export {
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  syncMcpServers,
  readMasterMcpServers,
  masterMcpPath,
  parseJsonc,
} from "./mcp-servers.ts";
export type { McpConfigListing, SyncReport, SyncTargetResult } from "./mcp-servers.ts";
export { syncAgentsFiles, readAgentsConfig } from "./agents-sync.ts";
export type { AgentsConfig, AgentsSyncReport, AgentsTargetResult } from "./agents-sync.ts";

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

import type { HarnessId } from "./types.ts";
import { listHarnesses } from "./registry.ts";

export const harnessIds: readonly HarnessId[] = Object.freeze(listHarnesses());
