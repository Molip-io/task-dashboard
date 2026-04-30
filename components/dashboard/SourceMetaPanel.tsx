import type { SourceMetaV2, RunStatus } from "@/lib/types";

const RETRIEVAL_LABEL: Record<string, string> = {
  full:    "전체 수집",
  sample:  "샘플 기반",
  partial: "부분 수집",
};

interface Props {
  sourceMeta?: SourceMetaV2;
  runStatus?: RunStatus | string;
  warnings?: string[];
  rawTaskCount?: number;
  rawTaskWindowDays?: number;
  agentTaskCount?: number;
  rawTaskDbConfigured?: boolean;
  slackSignalCount?: number;
}

export function SourceMetaPanel({
  sourceMeta,
  runStatus,
  warnings = [],
  rawTaskCount,
  rawTaskWindowDays = 7,
  agentTaskCount,
  rawTaskDbConfigured = false,
  slackSignalCount,
}: Props) {
  const isPartial = runStatus === "partial";

  return (
    <div className="mt-4 space-y-2">
      {/* partial 상태 경고 */}
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

      {/* warnings — 항상 노출 */}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
          <p className="text-xs font-bold text-yellow-700 uppercase tracking-wide mb-1">
            수집 경고 ({warnings.length})
          </p>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-800">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 데이터 출처 + source_meta 정보 바 */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600">

          {/* 업무 원본 */}
          <span className="flex items-center gap-1">
            <span className="text-gray-400">업무 원본</span>
            {rawTaskDbConfigured ? (
              <strong className="text-gray-700">
                Notion 팀 작업 현황
                {rawTaskCount !== undefined && ` (${rawTaskCount}건)`}
              </strong>
            ) : (
              <span className="text-amber-600 font-medium">미설정 — NOTION_TASK_DATABASE_ID 필요</span>
            )}
          </span>

          {/* 조회 기간 — Agent source_meta 없으면 rawTask 기본값 표시 */}
          {sourceMeta?.lookback_days === undefined && rawTaskDbConfigured && (
            <span>
              조회 기간 <strong className="text-gray-700">최근 {rawTaskWindowDays}일</strong>
            </span>
          )}

          {/* 판단 원본 */}
          <span className="flex items-center gap-1">
            <span className="text-gray-400">판단 원본</span>
            <strong className="text-gray-700">
              Notion 업무현황 요약
              {agentTaskCount !== undefined && agentTaskCount > 0 && ` (tasks ${agentTaskCount}건)`}
            </strong>
          </span>

          {/* source_meta 필드들 */}
          {sourceMeta?.lookback_days !== undefined && (
            <span>조회 기간 <strong className="text-gray-700">최근 {sourceMeta.lookback_days}일</strong></span>
          )}
          {(sourceMeta?.window_start || sourceMeta?.window_end) && (
            <span>
              기간{" "}
              <strong className="text-gray-700">
                {sourceMeta.window_start ?? "?"} ~ {sourceMeta.window_end ?? "?"}
              </strong>
            </span>
          )}
          {sourceMeta?.notion_items !== undefined && (
            <span>Agent Notion <strong className="text-gray-700">{sourceMeta.notion_items}건</strong></span>
          )}
          {sourceMeta?.slack_messages !== undefined && (
            <span>Slack 신호 <strong className="text-gray-700">{sourceMeta.slack_messages}건</strong></span>
          )}
          {slackSignalCount !== undefined && slackSignalCount > 0 && (
            <span>Slack 시그널 <strong className="text-gray-700">{slackSignalCount}건</strong></span>
          )}
          {sourceMeta?.retrieval_mode && (
            <span>
              수집 방식{" "}
              <strong className="text-gray-700">
                {RETRIEVAL_LABEL[sourceMeta.retrieval_mode] ?? sourceMeta.retrieval_mode}
              </strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
