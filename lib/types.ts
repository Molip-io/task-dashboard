export type StatusLevel = "normal" | "watch" | "risk" | "blocked";
export type RunStatus = "success" | "partial" | "failed";

export interface SourceMeta {
  notion_db: string;
  notion_filter: string;
  slack_channels: string[];
  slack_keywords: string[];
  notion_items: number;
  slack_messages: number;
  window_start: string;
  window_end: string;
}

export interface WorkStatusResult {
  target_key: string;
  target_name: string;
  target_type: string;
  lookback_days: number;
  summary: string;
  status: StatusLevel;
  errors: string[];
  warnings: string[];
  highlights: string[];
  delays: string[];
  blockers: string[];
  bottlenecks: string[];
  risks: string[];
  attention_items: Array<{ item: string; why: string } | string>;
  source_meta: SourceMeta;
  run_status: RunStatus;
}

export interface WorkStatusPayload {
  date: string;
  run_id: string;
  results: WorkStatusResult[];
  status: RunStatus;
}

export interface StoredRun extends WorkStatusPayload {
  id: string;
  created_at: string;
}
