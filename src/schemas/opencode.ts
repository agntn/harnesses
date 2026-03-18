export interface OpenCodeSession {
  id: string;
  project_id: string;
  workspace_id: string | null;
  parent_id: string | null;
  slug: string;
  directory: string;
  title: string;
  version: string;
  share_url: string | null;
  summary_additions: number | null;
  summary_deletions: number | null;
  summary_files: number | null;
  time_created: number;
  time_updated: number;
  time_compacting: number | null;
  time_archived: number | null;
}

export interface OpenCodeMessage {
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: unknown;
}

export interface OpenCodeTextPart {
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
}

export interface OpenCodeReasoningPart {
  type: "reasoning";
  text: string;
}

export interface OpenCodeToolPart {
  type: "tool";
  callID: string;
  tool: string;
  state: "pending" | "running" | "completed" | "error";
}

export interface OpenCodeFilePart {
  type: "file";
  mime: string;
  filename: string;
  url: string;
  source?: string;
}

export interface OpenCodeSubtaskPart {
  type: "subtask";
  prompt: string;
  description: string;
  agent?: string;
  model?: string;
  command?: string;
}

export interface OpenCodeStepStartPart {
  type: "step-start";
  snapshot?: string;
}

export interface OpenCodeStepFinishPart {
  type: "step-finish";
  reason: string;
  cost?: number;
  tokens?: unknown;
  snapshot?: string;
}

export interface OpenCodeSnapshotPart {
  type: "snapshot";
  snapshot: string;
}

export interface OpenCodePatchPart {
  type: "patch";
  hash: string;
  files: unknown;
}

export interface OpenCodeAgentPart {
  type: "agent";
  name: string;
  source?: string;
}

export interface OpenCodeRetryPart {
  type: "retry";
  attempt: number;
  error: string;
  time?: number;
}

export interface OpenCodeCompactionPart {
  type: "compaction";
  auto?: boolean;
  overflow?: boolean;
}

export type OpenCodePart =
  | OpenCodeTextPart
  | OpenCodeReasoningPart
  | OpenCodeToolPart
  | OpenCodeFilePart
  | OpenCodeSubtaskPart
  | OpenCodeStepStartPart
  | OpenCodeStepFinishPart
  | OpenCodeSnapshotPart
  | OpenCodePatchPart
  | OpenCodeAgentPart
  | OpenCodeRetryPart
  | OpenCodeCompactionPart;

export interface OpenCodeTodo {
  session_id: string;
  content: string;
  status: string;
  priority: string;
  position: number;
  time_created: number;
  time_updated: number;
}

export interface OpenCodeProject {
  id: string;
  worktree: string;
  vcs: string | null;
  name: string | null;
}
