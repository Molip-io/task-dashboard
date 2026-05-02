"use client";

import { useState } from "react";
import type { OwnerStatus, ConfirmationQueueItem, ActionType } from "@/lib/types";
import { StatusBadge, statusBorder } from "./shared";

// ── Action type 배지 ──────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  Decide:  "결정",
  Ask:     "확인",
  Align:   "정렬",
  Unblock: "병목 해소",
  Watch:   "관찰",
  Ignore:  "무시",
};

const ACTION_TYPE_CLS: Record<ActionType, string> = {
  Decide:  "bg-red-50 text-red-600 border-red-200",
  Ask:     "bg-orange-50 text-orange-600 border-orange-200",
  Align:   "bg-blue-50 text-blue-600 border-blue-200",
  Unblock: "bg-purple-50 text-purple-600 border-purple-200",
  Watch:   "bg-gray-50 text-gray-500 border-gray-200",
  Ignore:  "bg-gray-50 text-gray-400 border-gray-100",
};

function ActionBadge({ type }: { type?: ActionType | string }) {
  if (!type) return null;
  const label = ACTION_TYPE_LABELS[type as ActionType] ?? type;
  const cls   = ACTION_TYPE_CLS[type as ActionType]   ?? "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

// ── 타이밍 레이블 ─────────────────────────────────────────────────────────────

function timingLabel(timing?: string, urgency?: string) {
  const t = timing ?? urgency;
  if (t === "today")     return { label: "오늘", cls: "text-red-600 font-bold" };
  if (t === "this_week") return { label: "이번 주", cls: "text-orange-500" };
  if (t === "high" || t === "critical") return { label: "높음", cls: "text-orange-500" };
  return null;
}

// ── 메트릭 행 ────────────────────────────────────────────────────────────────

interface MetricItem { label: string; value: number; warn?: boolean }

function MetricRow({ items }: { items: MetricItem[] }) {
  const visible = items.filter((m) => m.value > 0);
  if (!visible.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {visible.map((m) => (
        <span
          key={m.label}
          className={`text-xs px-2 py-0.5 rounded-full ${
            m.warn
              ? "bg-red-50 text-red-600"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {m.label} {m.value}
        </span>
      ))}
    </div>
  );
}

// ── OwnerStatusCard ───────────────────────────────────────────────────────────

export interface OwnerStatusCardProps {
  owner: OwnerStatus;
  /** rawTasks 기반 프로젝트 목록 */
  projects: string[];
  /** rawTasks 기반 임박 작업 수 */
  dueSoon: number;
  /** confirmation_queue 중 이 담당자에 연결된 항목 */
  questions: ConfirmationQueueItem[];
}

export function OwnerStatusCard({
  owner,
  projects,
  dueSoon,
  questions,
}: OwnerStatusCardProps) {
  const [showAllQ, setShowAllQ] = useState(false);
  const MAX_Q = 2;

  const metrics: MetricItem[] = [
    { label: "전체",     value: owner.metrics?.["전체"]     ?? 0 },
    { label: "진행",     value: owner.metrics?.["진행"]     ?? owner.metrics?.active_tasks ?? 0 },
    { label: "마감초과", value: owner.metrics?.["초과"]     ?? owner.metrics?.overdue_tasks ?? 0, warn: true },
    { label: "임박",     value: dueSoon, warn: dueSoon > 0 },
  ];

  const displayedQ = showAllQ ? questions : questions.slice(0, MAX_Q);
  const hiddenQCount = questions.length - MAX_Q;

  return (
    <div className={`bg-white rounded-xl border-2 ${statusBorder(owner.status)} p-4 shadow-sm flex flex-col gap-3`}>
      {/* 이름 + 상태 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 text-sm">👤 {owner.owner}</h3>
        <StatusBadge status={owner.status} size="xs" />
      </div>

      {/* 프로젝트 목록 */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {projects.map((p) => (
            <span key={p} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* 메트릭 */}
      <MetricRow items={metrics} />

      {/* 현재 상황 summary */}
      {owner.summary && (
        <p className="text-xs text-gray-600 leading-relaxed">{owner.summary}</p>
      )}

      {/* 집중 업무 (notable_load) */}
      {!!owner.notable_load?.length && (
        <div>
          <p className="text-xs font-semibold text-orange-600 mb-1">집중 업무</p>
          <ul className="space-y-0.5">
            {owner.notable_load.map((l, i) => (
              <li key={i} className="text-xs text-gray-700 flex gap-1">
                <span className="text-orange-400 shrink-0">•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 물어볼 것 (confirmation_queue 연결) */}
      {questions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-blue-600 mb-1.5">
            물어볼 것 ({questions.length})
          </p>
          <div className="space-y-1.5">
            {displayedQ.map((q, i) => {
              const atype = q.type ?? q.action_type;
              const question = q.question ?? q.item ?? q.title ?? q.summary ?? "";
              const tl = timingLabel(q.timing, q.urgency);

              return (
                <div
                  key={i}
                  className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2"
                >
                  {/* 경로 */}
                  <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 mb-0.5">
                    {atype && <ActionBadge type={atype} />}
                    {q.project && (
                      <span className="font-semibold text-gray-700">{q.project}</span>
                    )}
                    {q.workstream && <><span>›</span><span>{q.workstream}</span></>}
                    {q.function   && <><span>›</span><span>{q.function}</span></>}
                    {tl && (
                      <span className={`ml-auto ${tl.cls}`}>{tl.label}</span>
                    )}
                  </div>

                  {question && (
                    <p className="text-xs text-gray-800 font-medium leading-snug">
                      {question}
                    </p>
                  )}

                  {q.requested_action && (
                    <p className="mt-0.5 text-xs text-blue-700">
                      → {q.requested_action}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 더 보기 */}
          {!showAllQ && hiddenQCount > 0 && (
            <button
              onClick={() => setShowAllQ(true)}
              className="mt-1.5 text-xs text-blue-500 hover:text-blue-700"
            >
              나머지 {hiddenQCount}건 보기 ▾
            </button>
          )}
          {showAllQ && hiddenQCount > 0 && (
            <button
              onClick={() => setShowAllQ(false)}
              className="mt-1 text-xs text-gray-400 hover:text-gray-600"
            >
              접기 ▴
            </button>
          )}
        </div>
      )}
    </div>
  );
}
