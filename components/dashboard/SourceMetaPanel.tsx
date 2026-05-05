import type { SourceMetaV2, RunStatus, OverviewMetrics, NotionTasksHealth } from "@/lib/types";

const RETRIEVAL_LABEL: Record<string, string> = {
  full:    "전체 수집",
  sample:  "샘플 기반",
  partial: "부분 수집",
};

const KPI_CHIPS: Array<{ key: keyof OverviewMetrics; label: string; alert?: boolean }> = [
  { key: "total_tasks",         label: "작업" },
  { key: "active_tasks",        label: "진행 중" },
  { key: "overdue_tasks",       label: "마감 초과", alert: true },
  { key: "high_priority_tasks", label: "고우선" },
];

const RETRIEVAL_MODE_LABEL: Record<string, string> = {
  structured_query: "구조화 질의",
  db_fetch: "DB 전체 조회",
  search_fallback: "검색 fallback",
};

interface Props {
  sourceMeta?: SourceMetaV2;
  runStatus?: RunStatus | string;
  warnings?: string[];
  rawTaskCount?: number;
  agentTaskCount?: number;
  rawTaskDbConfigured?: boolean;
  slackSignalCount?: number;
  metrics?: OverviewMetrics;
  confirmCount?: number;
  notionTasksHealth?: NotionTasksHealth;
}

export function SourceMetaPanel({
  sourceMeta,
  runStatus,
  warnings = [],
  rawTaskCount,
  agentTaskCount,
  rawTaskDbConfigured = false,
  slackSignalCount,
  metrics,
  confirmCount,
  notionTasksHealth,
}: Props) {
  const isNotionPartial = notionTasksHealth?.status === "partial";
  const isPartial = runStatus === "partial" && !isNotionPartial;
  const hasKpi = metrics && KPI_CHIPS.some(({ key }) => metrics[key] !== undefined);
  const showKpiBar = hasKpi || (confirmCount !== undefined && confirmCount > 0);

  // Agent 판단 기간 결정
  const agentDays =
    sourceMeta?.override_lookback_days ??
    sourceMeta?.default_lookback_days ??
    sourceMeta?.lookback_days;

  return (
    <div className="mt-4 space-y-2">
      {/* Notion 전체 업무 조회 실패 partial 경고 */}
      {isNotionPartial && (
        <details className="rounded-lg bg-amber-50 border border-amber-300 overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer flex items-start gap-2 select-none hover:bg-amber-100">
            <span className="text-amber-500 text-sm shrink-0 mt-0.5">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Notion 전체 업무 조회 실패 · 핵심 근거 기반 partial 판단
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                담당자별 업무량, stale task, 전체 task 수는 누락될 수 있습니다. 자세히 보려면 펼치세요.
              </p>
            </div>
            <span className="text-amber-500 text-xs font-normal shrink-0 mt-0.5">펼치기 ▾</span>
          </summary>
          <div className="px-4 pb-3 pt-1 border-t border-amber-200 space-y-1">
            <p className="text-xs text-amber-800">
              Notion <code className="bg-amber-100 rounded px-1">팀 작업 현황</code> 전체 조회가 실패해
              핵심 근거 기반으로 판단했습니다. 담당자별 업무량, stale task, 전체 task 수는 누락될 수 있습니다.
            </p>
            {notionTasksHealth?.failure_reason && (
              <p className="text-xs text-amber-700">
                실패 원인: <span className="font-medium">{notionTasksHealth.failure_reason}</span>
              </p>
            )}
            {notionTasksHealth?.retrieval_mode && (
              <p className="text-xs text-amber-700">
                사용된 방식:{" "}
                <span className="font-medium">
                  {RETRIEVAL_MODE_LABEL[notionTasksHealth.retrieval_mode] ?? notionTasksHealth.retrieval_mode}
                </span>
              </p>
            )}
          </div>
        </details>
      )}

      {/* 일반 partial 상태 경고 (Notion evidence 외 원인) */}
      {isPartial && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-300 px-4 py-3 flex items-start gap-2">
          <span className="text-yellow-500 text-sm shrink-0 mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">일부 데이터 기반 판단입니다.</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              수집이 완전하지 않아 일부 섹션이 비어 있거나 부정확할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 두 영역 분리: Agent 판단 기준 | 원본 작업 기준 */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600">

          {/* ── Agent 판단 기준 ── */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
              Agent 판단
            </span>
            <span className="flex items-center gap-1">
              <span className="text-gray-400">출처</span>
              <strong className="text-gray-700">
                Notion 업무현황 요약
                {agentTaskCount !== undefined && agentTaskCount > 0 && ` (${agentTaskCount}건)`}
              </strong>
            </span>
            {agentDays !== undefined && (
              <span>
                기준 기간 <strong className="text-gray-700">최근 {agentDays}일</strong>
              </span>
            )}
            {(sourceMeta?.window_start || sourceMeta?.window_end) && (
              <span>
                <strong className="text-gray-700">
                  {sourceMeta.window_start ?? "?"} ~ {sourceMeta.window_end ?? "?"}
                </strong>
              </span>
            )}
            {sourceMeta?.notion_items !== undefined && (
              <span>Notion <strong className="text-gray-700">{sourceMeta.notion_items}건</strong></span>
            )}
            {sourceMeta?.slack_messages !== undefined && (
              <span>Slack <strong className="text-gray-700">{sourceMeta.slack_messages}건</strong></span>
            )}
            {slackSignalCount !== undefined && slackSignalCount > 0 && sourceMeta?.slack_messages === undefined && (
              <span>Slack 신호 <strong className="text-gray-700">{slackSignalCount}건</strong></span>
            )}
            {sourceMeta?.retrieval_mode && (
              <span>
                수집 <strong className="text-gray-700">
                  {RETRIEVAL_LABEL[sourceMeta.retrieval_mode] ?? sourceMeta.retrieval_mode}
                </strong>
              </span>
            )}
          </div>

          {/* 구분선 */}
          <span className="hidden sm:block text-gray-300 self-stretch border-l border-gray-200" />

          {/* ── 원본 작업 기준 ── */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
              원본 작업
            </span>
            {rawTaskDbConfigured ? (
              <span className="flex items-center gap-1">
                <span className="text-gray-400">DB</span>
                <strong className="text-gray-700">
                  Notion 팀 작업 현황
                  {rawTaskCount !== undefined && ` (${rawTaskCount}건)`}
                </strong>
              </span>
            ) : (
              <span className="text-amber-600 font-medium">미설정 — NOTION_TASK_DATABASE_ID 필요</span>
            )}
            {rawTaskDbConfigured && (
              <span className="text-gray-400">필터는 아래 테이블에서 선택</span>
            )}
          </div>
        </div>

        {/* KPI 칩 바 */}
        {showKpiBar && (
          <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap gap-1.5 items-center">
            {KPI_CHIPS.map(({ key, label, alert }) => {
              const val = metrics?.[key];
              if (val === undefined) return null;
              const isAlert = alert && val > 0;
              return (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
                    isAlert
                      ? "bg-red-50 border-red-300 text-red-700 font-bold"
                      : "bg-white border-gray-200 text-gray-600"
                  }`}
                >
                  <span className="font-bold tabular-nums">{val}</span>
                  <span className="opacity-75">{label}</span>
                </span>
              );
            })}
            {confirmCount !== undefined && confirmCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs text-orange-700 font-semibold">
                확인 {confirmCount}건
              </span>
            )}
            {isNotionPartial && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 font-medium">
                부분 근거
              </span>
            )}
          </div>
        )}
      </div>

      {/* 수집 경고 — 접기 처리 */}
      {warnings.length > 0 && (
        <details className="rounded-lg bg-yellow-50 border border-yellow-200 overflow-hidden">
          <summary className="px-4 py-2.5 cursor-pointer text-xs font-bold text-yellow-700 hover:bg-yellow-100 select-none flex items-center justify-between">
            <span>부분 수집 · 경고 {warnings.length}개</span>
            <span className="text-yellow-500 text-xs font-normal">펼치기 ▾</span>
          </summary>
          <ul className="px-4 pb-3 pt-1 space-y-0.5 border-t border-yellow-200">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-800">{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
