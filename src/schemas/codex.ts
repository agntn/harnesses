export interface CodexHistoryEntry {
  session_id: string;
  ts: number;
  text: string;
}

export interface CodexThread {
  id: string;
  rollout_path: string;
  created_at: number;
  updated_at: number;
  source: string;
  model_provider: string;
  cwd: string;
  title: string;
  sandbox_policy: string;
  approval_mode: string;
  tokens_used: number;
  archived: number;
  git_sha: string;
}

export interface CodexLogEntry {
  id: number;
  ts: number;
  ts_nanos: number;
  level: string;
  message: string;
  thread_id: string | null;
  process_uuid: string;
}
