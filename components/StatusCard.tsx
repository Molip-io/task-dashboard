import { WorkStatusResult } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

const BORDER: Record<string, string> = {
  normal:  "border-green-200",
  watch:   "border-yellow-300",
  risk:    "border-orange-300",
  blocked: "border-red-400",
};

function ItemList({ label, items, className }: { label: string; items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${className ?? "text-gray-500"}`}>{label}</p>
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

export function StatusCard({ result }: { result: WorkStatusResult }) {
  const borderColor = BORDER[result.status] ?? BORDER.normal;
  const hasIssues = result.errors.length > 0 || result.warnings.length > 0;

  return (
    <div className={`bg-white rounded-xl border-2 ${borderColor} p-5 shadow-sm flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400">{result.target_type}</p>
          <h3 className="text-base font-bold text-gray-900">{result.target_name}</h3>
        </div>
        <StatusBadge status={result.status} />
      </div>

      {result.summary && (
        <p className="text-sm text-gray-600 leading-relaxed">{result.summary}</p>
      )}

      <ItemList
        label="주의 항목"
        items={result.attention_items.map((a) =>
          typeof a === "string" ? a : `${a.item}${a.why ? ` — ${a.why}` : ""}`
        )}
        className="text-orange-600"
      />
      <ItemList label="병목" items={result.bottlenecks} className="text-purple-600" />
      <ItemList label="리스크" items={result.risks} className="text-red-600" />

      {hasIssues && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {result.errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">오류</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
              ))}
            </div>
          )}
          {result.warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mb-1">경고</p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">{w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
