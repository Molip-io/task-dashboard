import type { TeamStatus, OwnerStatus } from "@/lib/types";
import { StatusBadge, UrgencyBadge, statusBorder, Section } from "./shared";

// 영문 metric 키 → 한글 레이블 매핑
const METRIC_LABEL: Record<string, string> = {
  total: "전체", total_tasks: "전체",
  active: "진행 중", active_tasks: "진행 중", in_progress: "진행 중",
  planned: "예정", planned_tasks: "예정",
  done: "완료", completed: "완료", completed_tasks: "완료",
  overdue: "마감 초과", overdue_tasks: "마감 초과",
  due_soon: "임박", due_soon_tasks: "임박",
  paused: "보류", paused_tasks: "일시 정지",
  blocked: "막힘",
  high_priority: "고우선", high_priority_tasks: "고우선",
  confirm_request_tasks: "확인 요청",
  risk_count: "리스크",
  attention_count: "확인 필요",
};

function metricLabel(key: string): string {
  return METRIC_LABEL[key] ?? key;
}

function MetricRow({ metrics }: { metrics: Record<string, number> }) {
  const entries = Object.entries(metrics).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {entries.map(([k, v]) => (
        <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {metricLabel(k)} {v}
        </span>
      ))}
    </div>
  );
}

// ── 확인 필요 담당자 (상단 요약 전용 — Agent payload 기준) ────────────────────

export function OwnerAlertSummary({ owners }: { owners: OwnerStatus[] }) {
  const safeOwners = Array.isArray(owners) ? owners : [];
  const alertOwners = safeOwners.filter(
    (o) => o.status === "watch" || o.status === "risk" || o.status === "blocked"
  );
  if (!alertOwners.length) return null;

  return (
    <Section title={`확인 필요 담당자 (${alertOwners.length})`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {alertOwners.map((o, i) => (
          <div
            key={i}
            className={`bg-white rounded-xl border-2 ${statusBorder(o.status)} p-4 shadow-sm`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900 text-sm">👤 {o.owner}</h3>
              <StatusBadge status={o.status} size="xs" />
            </div>
            {o.metrics && <MetricRow metrics={o.metrics} />}
            {o.summary && (
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">{o.summary}</p>
            )}
            {!!o.notable_load?.length && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-orange-600 mb-1">집중 업무</p>
                <ul className="space-y-0.5">
                  {o.notable_load.map((l, j) => (
                    <li key={j} className="text-xs text-gray-700 flex gap-1">
                      <span className="text-orange-400 shrink-0">•</span>
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 전체 작업 담당자 현황 (rawTasks 기준) ─────────────────────────────────────

function OwnerCard({ o }: { o: OwnerStatus }) {
  return (
    <div className={`bg-white rounded-xl border-2 ${statusBorder(o.status)} p-4 shadow-sm`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 text-sm">👤 {o.owner}</h3>
        <StatusBadge status={o.status} size="xs" />
      </div>
      {o.metrics && <MetricRow metrics={o.metrics} />}
      {o.summary && (
        <p className="mt-2 text-xs text-gray-600 leading-relaxed">{o.summary}</p>
      )}
      {!!o.notable_load?.length && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-orange-600 mb-1">집중 업무</p>
          <ul className="space-y-0.5">
            {o.notable_load.map((l, j) => (
              <li key={j} className="text-xs text-gray-700 flex gap-1">
                <span className="text-orange-400 shrink-0">•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 전체 팀 + 작업 담당자 + 직원 커버리지 (상세 접힘 영역용) ──────────────────

export function TeamOwnerSummary({
  teams = [],
  owners = [],
}: {
  teams?: TeamStatus[];
  owners?: OwnerStatus[];
}) {
  return (
    <>
      {/* 팀별 현황 — 데이터 있을 때만 표시 */}
      {teams.length > 0 && (
        <Section title="팀별 현황">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((t, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border-2 ${statusBorder(t.status)} p-4 shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{t.team_name}</h3>
                  <StatusBadge status={t.status} size="xs" />
                </div>
                {t.metrics && <MetricRow metrics={t.metrics} />}
                {t.summary && (
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">{t.summary}</p>
                )}
                {!!t.attention_items?.length && (
                  <div className="mt-2 space-y-1">
                    {t.attention_items.map((a, j) => (
                      <div key={j} className="flex items-start gap-1.5">
                        <UrgencyBadge urgency={a.urgency} />
                        <span className="text-xs text-gray-700">{a.item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 전체 작업 담당자 현황 — rawTasks 기준 */}
      {owners.length > 0 && (
        <Section title="전체 작업 담당자 현황">
          <p className="text-xs text-gray-400 mb-3">
            Notion 팀 작업 현황 기준 · 작업이 배정된 담당자만 표시됩니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {owners.map((o, i) => <OwnerCard key={i} o={o} />)}
          </div>
        </Section>
      )}

      {/* 전체 직원 커버리지 — 구조 준비 (데이터 미수집 시 안내) */}
      <Section title="전체 직원 커버리지">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-5 text-sm text-gray-500">
          <p className="font-medium text-gray-600">작업이 없는 직원 확인</p>
          <p className="text-xs mt-1 text-gray-400">
            작업이 없는 직원까지 표시하려면 별도 팀원 마스터 DB 또는 Notion users 연동이 필요합니다.
          </p>
          {owners.length > 0 && (
            <p className="text-xs mt-1 text-gray-400">
              현재 작업 배정 인원: <strong className="text-gray-600">{owners.length}명</strong>
            </p>
          )}
        </div>
      </Section>
    </>
  );
}
