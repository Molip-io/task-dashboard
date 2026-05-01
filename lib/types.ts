// ── Shared ────────────────────────────────────────────────────────────────────
export type StatusLevel = "normal" | "watch" | "risk" | "blocked";
export type RunStatus = "success" | "partial" | "failed";
export type Urgency = "low" | "medium" | "high" | "critical";
export type SignalType =
  | "blocker"
  | "schedule_change"
  | "confirm_request"
  | "decision_waiting"
  | "discussion_spike"
  | "repeated_issue";

// ── V1 (legacy) ───────────────────────────────────────────────────────────────
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

/** V1 payload — results 배열 중심 */
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

// ── V2 ────────────────────────────────────────────────────────────────────────
export interface OverviewMetrics {
  total_tasks?: number;
  active_tasks?: number;
  planned_tasks?: number;
  completed_tasks?: number;
  due_soon_tasks?: number;
  overdue_tasks?: number;
  confirm_request_tasks?: number;
  paused_tasks?: number;
  high_priority_tasks?: number;
  bottleneck_count?: number;
  risk_count?: number;
  attention_count?: number;
}

export interface AttentionItemV2 {
  rank?: number;
  item: string;
  project?: string;
  team?: string;
  owner?: string;
  why?: string;
  evidence?: string;
  recommended_action?: string;
  urgency: Urgency;
}

export interface Overview {
  /** Agent v2 payload에서 사용 */
  overall_status?: StatusLevel | RunStatus;
  /** legacy fallback */
  status?: StatusLevel | RunStatus;
  summary?: string;
  metrics: OverviewMetrics;
  top_attention_items: AttentionItemV2[];
}

export interface ProjectMetrics {
  total_tasks?: number;
  active_tasks?: number;
  due_soon_tasks?: number;
  overdue_tasks?: number;
  confirm_request_tasks?: number;
  paused_tasks?: number;
  high_priority_tasks?: number;
  bottleneck_count?: number;
  attention_count?: number;
}

export interface SlackSignal {
  project?: string;
  channel?: string;
  type: SignalType | string;
  summary: string;
  related_task?: string;
  related_workstream?: string;
  confidence?: "low" | "medium" | "high";
}

export interface ProjectStatus {
  project_key?: string;
  project_name: string;
  status: StatusLevel;
  summary?: string;
  metrics?: ProjectMetrics;
  key_bottlenecks?: string[];
  attention_items?: AttentionItemV2[];
  slack_signals?: SlackSignal[];
}

export interface TeamStatus {
  team_name: string;
  status: StatusLevel;
  summary?: string;
  metrics?: Record<string, number>;
  attention_items?: AttentionItemV2[];
}

export interface OwnerStatus {
  owner: string;
  status: StatusLevel;
  summary?: string;
  metrics?: Record<string, number>;
  notable_load?: string[];
}

export interface TaskItem {
  task_name: string;
  project?: string;
  team?: string;
  /** 단일 문자열 (레거시) */
  owner?: string;
  /** 복수 담당자 배열 (v2 Agent) */
  owners?: string[];
  status?: string;
  priority?: string;
  sprint?: string;
  deadline?: string;
  risk_level?: StatusLevel;
  recommended_action?: string;
  doc_url?: string;
}

export interface SourceMetaV2 {
  notion_db?: string;
  slack_channels?: string[];
  window_start?: string;
  window_end?: string;
  lookback_days?: number;
  default_lookback_days?: number;
  override_lookback_days?: number;
  project_lookback_days?: number;
  retrieval_mode?: string;
  notion_items?: number;
  slack_messages?: number;
  generated_by?: "agent" | "manual" | "test" | string;
}

// ── Project Progress (프로젝트 진행 현황) ─────────────────────────────────────

export interface Workstream {
  label: string;
  status?: string;
  items?: string[];
  evidence?: string;
  next_action?: string;
}

export interface ConfirmationNeeded {
  item: string;
  owner?: string;
  reason?: string;
  requested_action?: string;
}

export interface ProjectProgress {
  project: string;
  current_summary?: string;
  workstreams?: Workstream[];
  next_actions?: string[];
  schedule_notes?: string;
  needs_confirmation?: ConfirmationNeeded[];
  slack_signals?: SlackSignal[];
  risks?: string[];
}

// ── Trend (run 간 비교) ───────────────────────────────────────────────────────
export interface TrendStatusChange {
  target: string;
  from: string;
  to: string;
}

export interface TrendProjectChange {
  project: string;
  previous_status: string;
  current_status: string;
  change: string;
}

export interface Trend {
  previous_run_id?: string;
  previous_date?: string;
  recommended_focus?: string;
  new_attention_items?: Array<AttentionItemV2 | string>;
  carried_over_attention_items?: Array<AttentionItemV2 | string>;
  resolved_attention_items?: Array<AttentionItemV2 | string>;
  status_changes?: Array<TrendStatusChange | string>;
  project_changes?: TrendProjectChange[];
  repeated_risks?: string[];
  summary?: string;
  overall_change?: string;
}

/** V2 payload — overview 중심 운영 판단 구조 */
export interface WorkStatusPayloadV2 {
  date: string;
  run_id: string;
  status: RunStatus;
  overview: Overview;
  projects: ProjectStatus[];
  teams?: TeamStatus[];
  owners?: OwnerStatus[];
  tasks?: TaskItem[];
  slack_signals?: SlackSignal[];
  source_meta?: SourceMetaV2;
  trend?: Trend;
  project_progress?: ProjectProgress[];
  warnings?: string[];
  errors?: string[];
}

/** 저장된 run — v1/v2 모두 담을 수 있는 wrapper */
export interface StoredRunV2 extends WorkStatusPayloadV2 {
  id: string;
  created_at: string;
}

// ── Type guards ───────────────────────────────────────────────────────────────
export function isV2Payload(
  p: unknown
): p is WorkStatusPayloadV2 {
  return (
    typeof p === "object" &&
    p !== null &&
    "overview" in p &&
    typeof (p as Record<string, unknown>).overview === "object"
  );
}

export function isV1Payload(
  p: unknown
): p is WorkStatusPayload {
  return (
    typeof p === "object" &&
    p !== null &&
    "results" in p &&
    Array.isArray((p as Record<string, unknown>).results)
  );
}

/** API /latest 응답 — v1/v2 + source 메타 */
export type LatestRunResponse = (
  | (StoredRun & { source?: string })
  | (StoredRunV2 & { source?: string })
) & { source?: string };
