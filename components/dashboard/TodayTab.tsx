"use client";

import { CeoActionQueue } from "./CeoActionQueue";
import type {
  CeoAction,
  ConfirmationQueueItem,
  PriorityProject,
  ProjectProgress,
  StatusLevel,
} from "@/lib/types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TodayTabProps {
  overviewSummary?: string;
  ceoActions: CeoAction[];
  confirmationQueue: ConfirmationQueueItem[];
  /** overview.priority_projects — 있으면 위험 프로젝트 기준으로 사용 */
  priorityProjects?: PriorityProject[];
  projectProgress: ProjectProgress[];
}

// ── 상태 배지 ─────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  risk:    "bg-red-100 text-red-700 border-red-200",
  blocked: "bg-purple-100 text-purple-700 border-purple-200",
  watch:   "bg-orange-100 text-orange-700 border-orange-200",
  normal:  "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABEL: Record<string, string> = {
  risk:    "위험",
  blocked: "막힘",
  watch:   "주의",
  normal:  "정상",
};

function StatusBadge({ status }: { status?: StatusLevel | string }) {
  const s = status ?? "normal";
  const cls = STATUS_CLS[s] ?? STATUS_CLS.normal;
  const label = STATUS_LABEL[s] ?? s;
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// ── 위험 프로젝트 요약 ─────────────────────────────────────────────────────────

const MAX_RISK_PROJECTS = 3;

function RiskProjectsSummary({
  priorityProjects,
  projectProgress,
}: {
  priorityProjects?: PriorityProject[];
  projectProgress: ProjectProgress[];
}) {
  // priority_projects 우선, 없으면 project_progress 위험/막힘 필터
  let riskItems: Array<{
    project: string;
    status?: StatusLevel | string;
    priority_score?: number;
    priority_reason?: string;
  }>;

  if (priorityProjects && priorityProjects.length > 0) {
    riskItems = priorityProjects.slice(0, MAX_RISK_PROJECTS);
  } else {
    riskItems = projectProgress
      .filter((pp) => pp.status === "risk" || pp.status === "blocked")
      .slice(0, MAX_RISK_PROJECTS)
      .map((pp) => ({
        project: pp.project,
        status: pp.status,
        priority_score: pp.priority_score,
        priority_reason: pp.priority_reason ?? pp.current_summary ?? pp.display_summary ?? pp.summary,
      }));
  }

  if (!riskItems.length) return null;

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        위험 프로젝트 ({riskItems.length})
      </h2>
      <div className="space-y-2">
        {riskItems.map((item, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-sm font-semibold text-gray-800">
                {item.project}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {item.priority_score !== undefined && (
                  <span className="text-xs text-gray-400">
                    점수 {item.priority_score}
                  </span>
                )}
                <StatusBadge status={item.status} />
              </div>
            </div>
            {item.priority_reason && (
              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">
                {item.priority_reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 담당자 미지정 항목 ─────────────────────────────────────────────────────────

const INVALID_OWNERS = new Set([
  "확인 필요 담당자", "담당자 확인 필요", "담당자 미정",
  "unknown owner", "미기록 담당자", "미기록",
]);

function isAssigned(owner?: string | null): boolean {
  if (!owner) return false;
  return !INVALID_OWNERS.has(owner.trim());
}

function UnassignedItems({ confirmationQueue }: { confirmationQueue: ConfirmationQueueItem[] }) {
  const unassigned = confirmationQueue.filter(
    (c) => !isAssigned(c.owner) || c.owner_status === "unassigned"
  );

  if (!unassigned.length) return null;

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        담당자 미지정 ({unassigned.length})
      </h2>
      <div className="space-y-2">
        {unassigned.map((c, i) => (
          <div
            key={i}
            className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3"
          >
            {/* 프로젝트 / 워크스트림 / 기능 경로 */}
            <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 mb-1">
              {c.project && (
                <span className="font-semibold text-gray-700">{c.project}</span>
              )}
              {c.workstream && (
                <>
                  <span>›</span>
                  <span>{c.workstream}</span>
                </>
              )}
              {c.function && (
                <>
                  <span>›</span>
                  <span>{c.function}</span>
                </>
              )}
            </div>

            {/* 질문 / 항목 */}
            <p className="text-sm text-gray-800 font-medium leading-snug">
              {c.question ?? c.item ?? c.title ?? c.summary ?? ""}
            </p>

            {/* 요청 액션 */}
            {c.requested_action && (
              <p className="mt-1 text-xs text-amber-700">
                → {c.requested_action}
              </p>
            )}

            <p className="mt-1.5 text-xs text-amber-600 font-medium">
              담당자 미지정
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── TodayTab ──────────────────────────────────────────────────────────────────

export function TodayTab({
  overviewSummary,
  ceoActions,
  confirmationQueue,
  priorityProjects,
  projectProgress,
}: TodayTabProps) {
  const isEmpty =
    !overviewSummary &&
    ceoActions.length === 0 &&
    confirmationQueue.length === 0 &&
    !priorityProjects?.length &&
    !projectProgress.some((pp) => pp.status === "risk" || pp.status === "blocked");

  return (
    <div className="space-y-6">
      {/* 1. 이번 주 운영 판단 요약 */}
      {overviewSummary && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-start gap-3">
          <span className="shrink-0 text-xs font-bold text-indigo-500 uppercase tracking-wide mt-0.5">
            이번 주 운영 판단
          </span>
          <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-line">
            {overviewSummary}
          </p>
        </div>
      )}

      {/* 2. 오늘 대표 액션 Top 3 */}
      <CeoActionQueue
        actions={ceoActions}
        confirmationQueue={confirmationQueue}
        maxVisible={3}
      />

      {/* 3. 위험 프로젝트 요약 */}
      <RiskProjectsSummary
        priorityProjects={priorityProjects}
        projectProgress={projectProgress}
      />

      {/* 4. 담당자 미지정 항목 */}
      <UnassignedItems confirmationQueue={confirmationQueue} />

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm">오늘 확인할 운영 판단 항목이 없습니다.</p>
        </div>
      )}
    </div>
  );
}
