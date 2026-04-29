import type { AttentionItemV2 } from "@/lib/types";
import { UrgencyBadge } from "./shared";

export function AttentionList({ items }: { items: AttentionItemV2[] }) {
  if (!items.length) {
    return (
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-5 py-6 text-center">
        <p className="text-sm text-gray-400">오늘 확인할 항목이 없습니다 ✓</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {items.map((it, i) => (
        <div
          key={i}
          className={`rounded-xl border px-5 py-4 bg-white shadow-sm ${
            it.urgency === "critical"
              ? "border-red-300 bg-red-50"
              : it.urgency === "high"
              ? "border-orange-200"
              : "border-gray-200"
          }`}
        >
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                {it.rank ?? i + 1}
              </span>
              <p className="font-semibold text-gray-900 text-sm leading-snug">{it.item}</p>
            </div>
            <UrgencyBadge urgency={it.urgency} />
          </div>

          {/* Meta tags */}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            {it.project && <span className="bg-gray-100 px-2 py-0.5 rounded-full">📁 {it.project}</span>}
            {it.team    && <span className="bg-gray-100 px-2 py-0.5 rounded-full">👥 {it.team}</span>}
            {it.owner   && <span className="bg-gray-100 px-2 py-0.5 rounded-full">👤 {it.owner}</span>}
          </div>

          {/* why */}
          {it.why && (
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{it.why}</p>
          )}

          {/* evidence */}
          {it.evidence && (
            <p className="mt-1 text-xs text-gray-400 italic">{it.evidence}</p>
          )}

          {/* recommended_action */}
          {it.recommended_action && (
            <div className="mt-2 flex items-start gap-1.5">
              <span className="text-xs font-semibold text-indigo-600 shrink-0 mt-0.5">→</span>
              <p className="text-xs text-indigo-700 font-medium">{it.recommended_action}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
