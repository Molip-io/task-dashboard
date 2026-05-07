import type { DashboardTask } from "./notion-tasks";
import type {
  ActionType,
  ConfirmationNeeded,
  ConfirmationQueueItem,
  DataConflict,
  EvidenceSummary,
  FunctionBreakdownItem,
  OwnerBreakdownItem,
  OwnerQuestion,
  ProjectDataHealth,
  ProjectProgress,
  SlackSignal,
  SprintStatusItem,
  StaleTask,
  TrackBreakdownItem,
  Workstream,
} from "./types";

export type ProjectFallbackMode =
  | "agent"
  | "missing_project_progress"
  | "invalid_payload"
  | "raw_tasks_only";

export interface ProjectProgressViewModel {
  project: string;
  status?: ProjectProgress["status"];
  priority_score?: number;
  priority_rank?: number;
  priority_reason?: string;
  confidence_score?: number;
  current_summary: string;
  display_summary?: string;
  schedule_notes?: string;
  project_data_health: ProjectDataHealth;
  function_status: FunctionBreakdownItem[];
  sprint_status: SprintStatusItem[];
  owner_status: OwnerBreakdownItem[];
  workstreams: Workstream[];
  risks: string[];
  data_conflicts: DataConflict[];
  stale_tasks: StaleTask[];
  confirmation_queue: ConfirmationQueueItem[];
  needs_confirmation: ConfirmationNeeded[];
  next_actions: string[];
  slack_signals: SlackSignal[];
  fallbackMode: ProjectFallbackMode;
  fallbackNotice?: string;
  parseErrorRunId?: string;
  parseErrorMessage?: string;
  rawTaskCount: number;
}

export interface ProjectProgressViewModelOptions {
  isFallback?: boolean;
  fallbackMode?: ProjectFallbackMode;
  parseErrorRunId?: string;
  parseErrorMessage?: string;
  rawTaskCount?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function safeArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function safeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }
  return safeArray<unknown>(value)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeTrackItem(value: unknown): TrackBreakdownItem | null {
  if (!isRecord(value)) return null;
  const track = safeText(value.track ?? value.label ?? value.name);
  if (!track) return null;
  return {
    track,
    status: safeText(value.status),
    summary: safeText(value.summary ?? value.display_summary),
    owners: safeStringArray(value.owners ?? value.owner),
  };
}

function normalizeFunctionItem(value: unknown): FunctionBreakdownItem | null {
  if (!isRecord(value)) return null;
  const name = safeText(value.function ?? value.label ?? value.name ?? value.title);
  if (!name) return null;
  return {
    function: name,
    status: safeText(value.status),
    summary: safeText(value.summary ?? value.display_summary),
    next_action: safeText(value.next_action ?? value.requested_action),
    owners: safeStringArray(value.owners ?? value.owner),
    track: safeText(value.track ?? value.team),
  };
}

function normalizeOwnerQuestion(value: unknown, owner: string): OwnerQuestion | null {
  if (!isRecord(value)) return null;
  const question = safeText(value.question ?? value.item ?? value.summary ?? value.title);
  if (!question) return null;
  return {
    project: safeText(value.project) ?? owner,
    workstream: safeText(value.workstream),
    function: safeText(value.function) ?? null,
    track: safeText(value.track),
    question,
    reason: safeText(value.reason),
    urgency:
      value.urgency === "today" || value.urgency === "this_week" || value.urgency === "later"
        ? value.urgency
        : undefined,
    action_type:
      value.action_type === "Decide" ||
      value.action_type === "Ask" ||
      value.action_type === "Align" ||
      value.action_type === "Unblock" ||
      value.action_type === "Watch" ||
      value.action_type === "Ignore"
        ? (value.action_type as ActionType)
        : undefined,
  };
}

function normalizeOwnerItem(value: unknown): OwnerBreakdownItem | null {
  if (!isRecord(value)) return null;
  const owner = safeText(value.owner ?? value.name);
  if (!owner) return null;
  const questions = safeArray(value.questions)
    .map((item) => normalizeOwnerQuestion(item, owner))
    .filter((item): item is OwnerQuestion => item !== null);

  return {
    owner,
    status: safeText(value.status),
    summary: safeText(value.summary ?? value.display_summary),
    tasks: safeStringArray(value.tasks ?? value.items),
    questions,
  };
}

function normalizeSprintItem(value: unknown): SprintStatusItem | null {
  if (!isRecord(value)) return null;
  const sprint = safeText(value.sprint ?? value.label ?? value.name);
  if (!sprint) return null;
  return {
    sprint,
    status: safeText(value.status),
    summary: safeText(value.summary ?? value.display_summary),
    owners: safeStringArray(value.owners ?? value.owner),
    items: safeStringArray(value.items ?? value.tasks),
  };
}

function normalizeEvidenceSummary(value: unknown): EvidenceSummary | undefined {
  if (!isRecord(value)) return undefined;
  return {
    notion_count: safeNumber(value.notion_count),
    slack_count: safeNumber(value.slack_count),
    confidence:
      value.confidence === "low" ||
      value.confidence === "medium" ||
      value.confidence === "high" ||
      value.confidence === "unknown"
        ? value.confidence
        : undefined,
    combined_summary: safeText(value.combined_summary),
  };
}

function normalizeSlackSignal(value: unknown): SlackSignal | null {
  if (!isRecord(value)) return null;
  const summary = safeText(value.summary ?? value.text);
  const type = safeText(value.type ?? value.signal_type);
  if (!summary) return null;
  return {
    project: safeText(value.project),
    channel: safeText(value.channel),
    type: type ?? "info",
    summary,
    related_task: safeText(value.related_task),
    related_workstream: safeText(value.related_workstream ?? value.workstream),
    confidence:
      value.confidence === "low" || value.confidence === "medium" || value.confidence === "high"
        ? value.confidence
        : undefined,
  };
}

function normalizeWorkstream(value: unknown): Workstream | null {
  if (!isRecord(value)) return null;
  const label = safeText(value.label ?? value.name ?? value.title);
  if (!label) return null;

  const trackBreakdown = safeArray(value.track_breakdown)
    .map(normalizeTrackItem)
    .filter((item): item is TrackBreakdownItem => item !== null);
  const functionBreakdown = safeArray(value.function_breakdown ?? value.function_status)
    .map(normalizeFunctionItem)
    .filter((item): item is FunctionBreakdownItem => item !== null);
  const ownerBreakdown = safeArray(value.owner_breakdown ?? value.owner_status)
    .map(normalizeOwnerItem)
    .filter((item): item is OwnerBreakdownItem => item !== null);
  const slackSignals = safeArray(value.slack_signals)
    .map(normalizeSlackSignal)
    .filter((item): item is SlackSignal => item !== null);

  const evidenceSummary =
    normalizeEvidenceSummary(value.evidence_summary) ??
    normalizeEvidenceSummary(value.evidence);

  return {
    label,
    status: safeText(value.status),
    items: safeStringArray(value.items ?? value.tasks ?? value.key_tasks),
    evidence:
      typeof value.evidence === "string"
        ? value.evidence
        : evidenceSummary ?? undefined,
    next_action: safeText(value.next_action ?? value.requested_action),
    display_summary: safeText(value.display_summary ?? value.summary),
    combined_summary: safeText(value.combined_summary),
    evidence_summary: evidenceSummary,
    track_breakdown: trackBreakdown,
    function_breakdown: functionBreakdown,
    owner_breakdown: ownerBreakdown,
    slack_signals: slackSignals,
    priority_score: safeNumber(value.priority_score),
    action_type:
      value.action_type === "Decide" ||
      value.action_type === "Ask" ||
      value.action_type === "Align" ||
      value.action_type === "Unblock" ||
      value.action_type === "Watch" ||
      value.action_type === "Ignore"
        ? (value.action_type as ActionType)
        : undefined,
    risks: safeStringArray(value.risks),
  };
}

function normalizeDataConflict(value: unknown): DataConflict | null {
  if (!isRecord(value)) return null;
  const summary = safeText(value.summary ?? value.description ?? value.interpretation);
  if (!summary) return null;
  return {
    severity:
      value.severity === "low" || value.severity === "medium" || value.severity === "high"
        ? value.severity
        : undefined,
    description: safeText(value.description) ?? summary,
    notion_state: safeText(value.notion_state),
    slack_state: safeText(value.slack_state),
    interpretation: safeText(value.interpretation),
    summary,
    recommended_action: safeText(value.recommended_action),
  };
}

function normalizeStaleTask(value: unknown): StaleTask | null {
  if (!isRecord(value)) return null;
  const taskName = safeText(value.task_name ?? value.task ?? value.title);
  if (!taskName) return null;
  return {
    task_name: taskName,
    days_since_update: safeNumber(value.days_since_update),
    status: safeText(value.status),
    workstream: safeText(value.workstream),
    slack_mentions: safeNumber(value.slack_mentions),
    recommended_action: safeText(value.recommended_action),
  };
}

function normalizeConfirmationItem(value: unknown): ConfirmationQueueItem | null {
  if (!isRecord(value)) return null;
  const item = safeText(value.item ?? value.question ?? value.summary ?? value.title);
  if (!item) return null;
  return {
    project: safeText(value.project),
    workstream: safeText(value.workstream),
    function: safeText(value.function),
    item,
    owner: safeText(value.owner),
    owner_status:
      value.owner_status === "assigned" ||
      value.owner_status === "unassigned" ||
      value.owner_status === "unknown"
        ? value.owner_status
        : undefined,
    requested_action: safeText(value.requested_action),
    urgency: safeText(value.urgency),
    reason: safeText(value.reason),
    timing:
      value.timing === "today" || value.timing === "this_week" || value.timing === "watch"
        ? value.timing
        : undefined,
    question: safeText(value.question),
    type:
      value.type === "Decide" ||
      value.type === "Ask" ||
      value.type === "Align" ||
      value.type === "Unblock" ||
      value.type === "Watch" ||
      value.type === "Ignore"
        ? (value.type as ActionType)
        : undefined,
    action_type:
      value.action_type === "Decide" ||
      value.action_type === "Ask" ||
      value.action_type === "Align" ||
      value.action_type === "Unblock" ||
      value.action_type === "Watch" ||
      value.action_type === "Ignore"
        ? (value.action_type as ActionType)
        : undefined,
    summary: safeText(value.summary),
    title: safeText(value.title),
    impact_if_delayed: safeText(value.impact_if_delayed),
  };
}

function normalizeLegacyConfirmation(value: unknown): ConfirmationNeeded | null {
  if (!isRecord(value)) return null;
  const item = safeText(value.item ?? value.summary ?? value.title);
  if (!item) return null;
  return {
    item,
    owner: safeText(value.owner ?? value.assignee),
    reason: safeText(value.reason),
    requested_action: safeText(value.requested_action),
  };
}

function normalizeProjectDataHealth(
  value: unknown,
  options: ProjectProgressViewModelOptions
): ProjectDataHealth {
  const record = isRecord(value) ? value : {};
  const notes = safeStringArray(record.notes);

  let fallbackNotice: string | undefined;
  if (options.fallbackMode === "invalid_payload") {
    fallbackNotice = "Agent payload 파싱 실패로 원본 작업 기반 요약을 표시합니다.";
  } else if (options.fallbackMode === "missing_project_progress") {
    fallbackNotice = "Agent payload에 project_progress가 없어 원본 작업 기반 요약을 표시합니다.";
  } else if (options.fallbackMode === "raw_tasks_only") {
    fallbackNotice = "판단 payload 없이 원본 작업 기반 요약을 표시합니다.";
  }

  const mergedNotes = uniqueStrings([
    ...(fallbackNotice ? [fallbackNotice] : []),
    ...notes,
  ]);

  return {
    status:
      record.status === "high" || record.status === "medium" || record.status === "low"
        ? record.status
        : options.isFallback
        ? "low"
        : undefined,
    notion_task_coverage:
      record.notion_task_coverage === "none" ||
      record.notion_task_coverage === "weak" ||
      record.notion_task_coverage === "sufficient" ||
      record.notion_task_coverage === "strong"
        ? record.notion_task_coverage
        : options.isFallback
        ? "strong"
        : undefined,
    slack_signal_coverage:
      record.slack_signal_coverage === "none" ||
      record.slack_signal_coverage === "weak" ||
      record.slack_signal_coverage === "sufficient" ||
      record.slack_signal_coverage === "strong"
        ? record.slack_signal_coverage
        : undefined,
    owner_mapping:
      record.owner_mapping === "none" ||
      record.owner_mapping === "partial" ||
      record.owner_mapping === "sufficient" ||
      record.owner_mapping === "strong"
        ? record.owner_mapping
        : undefined,
    schedule_coverage:
      record.schedule_coverage === "none" ||
      record.schedule_coverage === "partial" ||
      record.schedule_coverage === "sufficient"
        ? record.schedule_coverage
        : undefined,
    stale_task_count: safeNumber(record.stale_task_count),
    conflict_count: safeNumber(record.conflict_count),
    unlinked_slack_signal_count: safeNumber(record.unlinked_slack_signal_count),
    confidence_score: safeNumber(record.confidence_score),
    notes: mergedNotes,
  };
}

function deriveFunctionStatus(workstreams: Workstream[]): FunctionBreakdownItem[] {
  return workstreams
    .flatMap((workstream) => safeArray(workstream.function_breakdown))
    .map(normalizeFunctionItem)
    .filter((item): item is FunctionBreakdownItem => item !== null);
}

function deriveOwnerStatus(workstreams: Workstream[]): OwnerBreakdownItem[] {
  const directOwners = workstreams
    .flatMap((workstream) => safeArray(workstream.owner_breakdown))
    .map(normalizeOwnerItem)
    .filter((item): item is OwnerBreakdownItem => item !== null);

  if (directOwners.length > 0) return directOwners;

  const ownerMap = new Map<string, string[]>();
  for (const functionItem of deriveFunctionStatus(workstreams)) {
    for (const owner of safeStringArray(functionItem.owners)) {
      if (!ownerMap.has(owner)) ownerMap.set(owner, []);
      ownerMap.get(owner)!.push(functionItem.function);
    }
  }

  return Array.from(ownerMap.entries()).map(([owner, tasks]) => ({
    owner,
    summary: `기능: ${uniqueStrings(tasks).join(", ")}`,
    tasks: uniqueStrings(tasks),
  }));
}

function deriveSprintStatus(
  workstreams: Workstream[],
  record: Record<string, unknown>
): SprintStatusItem[] {
  const direct = safeArray(record.sprint_status)
    .map(normalizeSprintItem)
    .filter((item): item is SprintStatusItem => item !== null);
  if (direct.length > 0) return direct;

  return workstreams
    .filter((workstream) => /^SP\d+$/i.test(workstream.label) || /^Sprint\s+\d+$/i.test(workstream.label))
      .map((workstream) => ({
      sprint: workstream.label,
      status: workstream.status,
      summary: workstream.display_summary ?? workstream.combined_summary,
      owners: uniqueStrings(
        safeArray<OwnerBreakdownItem>(workstream.owner_breakdown).flatMap((owner) =>
          safeStringArray(owner.owner)
        )
      ),
      items: safeStringArray(workstream.items),
    }));
}

function buildFallbackNotice(options: ProjectProgressViewModelOptions): string | undefined {
  switch (options.fallbackMode) {
    case "invalid_payload":
      return "Agent payload 파싱 실패로 원본 작업 기반 요약을 표시합니다.";
    case "missing_project_progress":
      return "Agent payload의 project_progress가 없어 원본 작업 기반 요약을 표시합니다.";
    case "raw_tasks_only":
      return "판단 payload 없이 원본 작업 기반 요약을 표시합니다.";
    default:
      return undefined;
  }
}

function buildSummary(record: Record<string, unknown>, workstreams: Workstream[]): string {
  return (
    safeText(record.display_summary ?? record.current_summary ?? record.summary) ??
    `${workstreams.length}개 workstream`
  );
}

export function buildProjectProgressViewModel(
  value: ProjectProgress,
  options: ProjectProgressViewModelOptions = {}
): ProjectProgressViewModel {
  const record: Record<string, unknown> = isRecord(value) ? value : {};
  const workstreams = safeArray(record.workstreams)
    .map(normalizeWorkstream)
    .filter((item): item is Workstream => item !== null);
  const functionStatus = safeArray(record.function_status ?? record.function_breakdown)
    .map(normalizeFunctionItem)
    .filter((item): item is FunctionBreakdownItem => item !== null);
  const ownerStatus = safeArray(record.owner_status)
    .map(normalizeOwnerItem)
    .filter((item): item is OwnerBreakdownItem => item !== null);
  const sprintStatus = deriveSprintStatus(workstreams, record);
  const risks = safeStringArray(record.risks);
  const dataConflicts = safeArray(record.data_conflicts)
    .map(normalizeDataConflict)
    .filter((item): item is DataConflict => item !== null);
  const staleTasks = safeArray(record.stale_tasks)
    .map(normalizeStaleTask)
    .filter((item): item is StaleTask => item !== null);
  const confirmationQueue = safeArray(record.confirmation_queue)
    .map(normalizeConfirmationItem)
    .filter((item): item is ConfirmationQueueItem => item !== null);
  const needsConfirmation = safeArray(record.needs_confirmation)
    .map(normalizeLegacyConfirmation)
    .filter((item): item is ConfirmationNeeded => item !== null);
  const nextActions = safeStringArray(record.next_actions);
  const slackSignals = safeArray(record.slack_signals)
    .map(normalizeSlackSignal)
    .filter((item): item is SlackSignal => item !== null);

  const resolvedFunctions = functionStatus.length > 0 ? functionStatus : deriveFunctionStatus(workstreams);
  const resolvedOwners = ownerStatus.length > 0 ? ownerStatus : deriveOwnerStatus(workstreams);
  const fallbackNotice = buildFallbackNotice(options);
  const rawTaskCount = options.rawTaskCount ?? 0;

  return {
    project: safeText(record.project) ?? "이름 없는 프로젝트",
    status:
      record.status === "normal" ||
      record.status === "watch" ||
      record.status === "risk" ||
      record.status === "blocked"
        ? record.status
        : undefined,
    priority_score: safeNumber(record.priority_score),
    priority_rank: safeNumber(record.priority_rank),
    priority_reason: safeText(record.priority_reason),
    confidence_score: safeNumber(record.confidence_score),
    current_summary: buildSummary(record, workstreams),
    display_summary: safeText(record.display_summary),
    schedule_notes: safeText(record.schedule_notes),
    project_data_health: normalizeProjectDataHealth(record.project_data_health, options),
    function_status: resolvedFunctions,
    sprint_status: sprintStatus,
    owner_status: resolvedOwners,
    workstreams,
    risks,
    data_conflicts: dataConflicts,
    stale_tasks: staleTasks,
    confirmation_queue: confirmationQueue,
    needs_confirmation: needsConfirmation,
    next_actions: nextActions,
    slack_signals: slackSignals,
    fallbackMode: options.fallbackMode ?? (options.isFallback ? "missing_project_progress" : "agent"),
    fallbackNotice,
    parseErrorRunId: options.parseErrorRunId,
    parseErrorMessage: options.parseErrorMessage,
    rawTaskCount,
  };
}

export function buildProjectProgressViewModels(
  items: ProjectProgress[],
  options: ProjectProgressViewModelOptions = {}
): ProjectProgressViewModel[] {
  return (Array.isArray(items) ? items : []).map((item) =>
    buildProjectProgressViewModel(item, options)
  );
}

export function countTasksForProject(rawTasks: DashboardTask[], projectName: string): number {
  return rawTasks.filter((task) => task.project === projectName).length;
}
