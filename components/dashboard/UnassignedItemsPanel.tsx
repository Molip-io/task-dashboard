"use client";

import type { ConfirmationQueueItem, ActionType } from "@/lib/types";

// ── 무효 담당자 ────────────────────────────────────────────────────────────────

const INVALID_OWNERS = new Set([
  "확인 필요 담당자", "담당자 확인 필요", "담당자 미정",
  "unknown owner", "미기록 담당자", "미기록",
]);

function isUnassigned(item: ConfirmationQueueItem): boolean {
  const owner = item.owner?.trim();
  if (!owner) return true;
  if (INVALID_OWNERS.has(owner)) return true;
  if (item.owner_status === "unassigned") return true;
  return false;
}

// ── Action type 레이블 ────────────────────────────────────────────────────────

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

// ── UnassignedItemsPanel ──────────────────────────────────────────────────────

export function UnassignedItemsPanel({
  items,
}: {
  items: ConfirmationQueueItem[];
}) {
  const unassigned = (Array.isArray(items) ? items : []).filter(isUnassigned);
  if (!unassigned.length) return null;

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        담당자 미지정 항목 ({unassigned.length})
      </h2>
      <div className="space-y-2">
        {unassigned.map((c, i) => {
          const atype = c.type ?? c.action_type;
          const question = c.question ?? c.item ?? c.title ?? c.summary ?? "";

          return (
            <div
              key={i}
              className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3"
            >
              {/* 경로 */}
              <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 mb-1">
                {atype && <ActionBadge type={atype} />}
                {c.project && (
                  <span className="font-semibold text-gray-700">{c.project}</span>
                )}
                {c.workstream && <><span>›</span><span>{c.workstream}</span></>}
                {c.function   && <><span>›</span><span>{c.function}</span></>}
              </div>

              {/* 질문 / 항목 */}
              {question && (
                <p className="text-sm text-gray-800 font-medium leading-snug">
                  {question}
                </p>
              )}

              {/* 요청 액션 */}
              {c.requested_action && (
                <p className="mt-1 text-xs text-amber-700">
                  → {c.requested_action}
                </p>
              )}

              {/* 근거 */}
              {c.reason && (
                <p className="mt-1 text-xs text-gray-500">{c.reason}</p>
              )}

              <p className="mt-1.5 text-xs text-amber-600 font-semibold">
                담당자 미지정
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
