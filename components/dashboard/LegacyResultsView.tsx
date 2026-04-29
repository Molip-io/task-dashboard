import type { WorkStatusResult } from "@/lib/types";
import { StatusBadge, statusBorder, Section } from "./shared";

function normalizeAttention(items: WorkStatusResult["attention_items"]): string[] {
  return items.map((a) =>
    typeof a === "string" ? a : `${a.item}${a.why ? ` — ${a.why}` : ""}`
  );
}

function ItemList({ label, items, cls }: { label: string; items: string[]; cls: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${cls}`}>{label}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-1">
            <span className="shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LegacyResultsView({ results }: { results: WorkStatusResult[] }) {
  if (!results.length) {
    return <p className="mt-10 text-center text-gray-400 text-sm">결과 항목이 없습니다.</p>;
  }

  return (
    <Section title="프로젝트 요약 (v1)">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((r) => (
          <div
            key={r.target_key}
            className={`bg-white rounded-xl border-2 ${statusBorder(r.status)} p-5 shadow-sm flex flex-col gap-2`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400">{r.target_type}</p>
                <h3 className="text-base font-bold text-gray-900">{r.target_name}</h3>
              </div>
              <StatusBadge status={r.status} />
            </div>
            {r.summary && (
              <p className="text-sm text-gray-600 leading-relaxed">{r.summary}</p>
            )}
            <ItemList label="주의 항목" items={normalizeAttention(r.attention_items)} cls="text-orange-600" />
            <ItemList label="병목"     items={r.bottlenecks}                           cls="text-purple-600" />
            <ItemList label="리스크"   items={r.risks}                                 cls="text-red-600" />
            {(r.errors.length > 0 || r.warnings.length > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                {r.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
                ))}
                {r.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">{w}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
