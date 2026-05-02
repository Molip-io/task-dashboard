"use client";

import { useState } from "react";
import type { CeoAction, ActionType, ConfirmationQueueItem } from "@/lib/types";

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  Decide:  "결정",
  Ask:     "확인",
  Align:   "정렬",
  Unblock: "병목 해소",
  Watch:   "관찰",
  Ignore:  "무시",
};

const ACTION_TYPE_CLS: Record<ActionType, string> = {
  Decide:  "bg-red-100 text-red-700 border-red-200",
  Ask:     "bg-orange-100 text-orange-700 border-orange-200",
  Align:   "bg-blue-100 text-blue-700 border-blue-200",
  Unblock: "bg-purple-100 text-purple-700 border-purple-200",
  Watch:   "bg-gray-100 text-gray-600 border-gray-200",
  Ignore:  "bg-gray-50 text-gray-400 border-gray-100",
};

const ACTION_TYPE_ORDER: ActionType[] = ["Unblock", "Decide", "Align", "Ask", "Watch", "Ignore"];

function actionTypeSortKey(type?: string): number {
  return ACTION_TYPE_ORDER.indexOf((type ?? "Watch") as ActionType);
}

function urgencyLabel(u?: string) {
  if (u === "today") return { label: "오늘", cls: "text-red-600 font-bold" };
  if (u === "this_week") return { label: "이번 주", cls: "text-orange-600" };
  return { label: "나중에", cls: "text-gray-400" };
}

const INVALID_OWNERS = new Set([
  "확인 필요 담당자",
  "담당자 확인 필요",
  "담당자 미정",
  "unknown owner",
  "미기록 담당자",
  "미기록",
]);

function isValidOwner(owner?: string | null): boolean {
  if (!owner) return false;
  const t = owner.trim();
  return t.length > 0 && !INVALID_OWNERS.has(t);
}

interface Props {
  actions: CeoAction[];
  confirmationQueue?: ConfirmationQueueItem[];
  /** 기본 노출 개수. 미지정 시 전체 표시 */
  maxVisible?: number;
}

export function CeoActionQueue({ actions, confirmationQueue = [], maxVisible }: Props) {
  const [showIgnored, setShowIgnored] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Normalize and merge with confirmation_queue fallback
  let items: CeoAction[] = [...actions];

  if (!items.length && confirmationQueue.length) {
    items = confirmationQueue.map((c): CeoAction => ({
      type: (c.type ?? c.action_type ?? "Ask") as ActionType,
      project: c.project ?? "",
      workstream: c.workstream,
      function: c.function,
      question: c.question ?? c.item ?? c.summary ?? c.title ?? "",
      owner: c.owner,
      owner_status: c.owner_status as CeoAction["owner_status"],
      reason: c.reason,
      impact_if_delayed: c.impact_if_delayed,
      urgency: c.timing === "today" ? "today" : c.timing === "this_week" ? "this_week" : "later",
    }));
  }

  if (!items.length) return null;

  const visible = showIgnored
    ? items
    : items.filter((a) => a.type !== "Ignore" && a.action_type !== "Ignore");
  const ignoredCount = items.filter(
    (a) => a.type === "Ignore" || a.action_type === "Ignore"
  ).length;

  const sorted = [...visible].sort((a, b) => {
    const pa = a.priority_score ?? 0;
    const pb = b.priority_score ?? 0;
    if (pa !== pb) return pb - pa;
    const ua = a.urgency === "today" ? 0 : a.urgency === "this_week" ? 1 : 2;
    const ub = b.urgency === "today" ? 0 : b.urgency === "this_week" ? 1 : 2;
    if (ua !== ub) return ua - ub;
    const ta = actionTypeSortKey(a.type ?? a.action_type);
    const tb = actionTypeSortKey(b.type ?? b.action_type);
    return ta - tb;
  });

  // maxVisible 슬라이스
  const cutoff = maxVisible && !showAll ? maxVisible : undefined;
  const displayed = cutoff ? sorted.slice(0, cutoff) : sorted;
  const hiddenCount = cutoff ? Math.max(0, sorted.length - cutoff) : 0;

  return (
    <section className="mt-6">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        오늘 대표 액션 ({sorted.length})
      </h2>
      <div className="space-y-2">
        {displayed.map((a, i) => {
          const atype = (a.type ?? a.action_type ?? "Ask") as ActionType;
          const label = ACTION_TYPE_LABELS[atype] ?? atype;
          const cls = ACTION_TYPE_CLS[atype] ?? ACTION_TYPE_CLS.Watch;
          const question = a.question ?? a.decision_needed ?? "";
          const urg = urgencyLabel(a.urgency);
          const validOwner =
            a.owner && isValidOwner(a.owner) ? a.owner : null;

          return (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`shrink-0 mt-0.5 inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}
                >
                  {label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 mb-1">
                    <span className="font-semibold text-gray-700">{a.project}</span>
                    {a.workstream && (
                      <>
                        <span>›</span>
                        <span>{a.workstream}</span>
                      </>
                    )}
                    {a.function && (
                      <>
                        <span>›</span>
                        <span>{a.function}</span>
                      </>
                    )}
                  </div>
                  {question && (
                    <p className="text-sm text-gray-800 leading-snug font-medium">
                      {question}
                    </p>
                  )}
                  {a.impact_if_delayed && (
                    <p className="mt-1 text-xs text-red-600">
                      지연 시: {a.impact_if_delayed}
                    </p>
                  )}
                  {a.reason && !a.impact_if_delayed && (
                    <p className="mt-1 text-xs text-gray-500">{a.reason}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    {validOwner && (
                      <span className="text-indigo-600">👤 {validOwner}</span>
                    )}
                    {!validOwner && a.owner_status === "unassigned" && (
                      <span className="text-amber-600">담당자 미지정</span>
                    )}
                    <span className={urg.cls}>{urg.label}</span>
                    {a.confidence && (
                      <span className="text-gray-400">신뢰도 {a.confidence}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* 더 보기 버튼 — maxVisible 초과 시 */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded-lg border border-gray-200 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          나머지 {hiddenCount}개 보기 ▾
        </button>
      )}
      {showAll && maxVisible && sorted.length > maxVisible && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-1 text-xs text-gray-400 hover:text-gray-600"
        >
          접기 ▴
        </button>
      )}
      {ignoredCount > 0 && (
        <button
          onClick={() => setShowIgnored((v) => !v)}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600"
        >
          {showIgnored
            ? "무시 항목 숨기기"
            : `무시 항목 ${ignoredCount}건 보기`}
        </button>
      )}
    </section>
  );
}
