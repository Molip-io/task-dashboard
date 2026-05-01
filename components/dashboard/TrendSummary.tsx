import type { Trend, AttentionItemV2 } from "@/lib/types";
import { Section } from "./shared";

type AnyRecord = Record<string, unknown>;

function itemText(item: AttentionItemV2 | string | AnyRecord): string {
  if (typeof item === "string") return item.trim();
  const o = item as AnyRecord;
  const text = String(
    o.item || o.title || o.summary || o.task_name || o.project || ""
  ).trim();
  if (text) return text;
  // 마지막 수단: project + reason 조합
  const parts = [o.project, o.reason].filter(Boolean).map(String);
  return parts.join(" — ").trim();
}

function ItemList({ items, color }: { items: Array<AttentionItemV2 | string | AnyRecord>; color: string }) {
  const visible = items.map(itemText).filter(Boolean);
  if (!visible.length) return null;
  return (
    <ul className="space-y-1 mt-1">
      {visible.map((text, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs">
          <span className={`shrink-0 mt-0.5 ${color}`}>•</span>
          <span className="text-gray-700">{text}</span>
        </li>
      ))}
    </ul>
  );
}

function Block({ label, color, items }: {
  label: string;
  color: string;
  items: Array<AttentionItemV2 | string | AnyRecord>;
}) {
  const count = items.map(itemText).filter(Boolean).length;
  if (!count) return null;
  return (
    <div>
      <p className={`text-xs font-semibold ${color} mb-0.5`}>{label} ({count})</p>
      <ItemList items={items} color={color} />
    </div>
  );
}

export function TrendSummary({ trend }: { trend?: Trend }) {
  const header = (
    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
      지난 실행 대비 변화
    </h2>
  );

  if (!trend) {
    return (
      <section className="mt-8">
        {header}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-8 text-center">
          <p className="text-sm text-gray-500">이전 비교 데이터 없음</p>
          <p className="text-xs text-gray-400 mt-1">Agent가 trend 필드를 포함하면 변화 내역이 표시됩니다.</p>
        </div>
      </section>
    );
  }

  const carried  = (trend.carried_over_attention_items  ?? []) as Array<AttentionItemV2 | string | AnyRecord>;
  const newItems = (trend.new_attention_items           ?? []) as Array<AttentionItemV2 | string | AnyRecord>;
  const resolved = (trend.resolved_attention_items      ?? []) as Array<AttentionItemV2 | string | AnyRecord>;
  const changes  = trend.status_changes                ?? [];
  const risks    = (trend.repeated_risks               ?? []) as Array<string | AnyRecord>;

  const changeTexts = changes.map((c) =>
    typeof c === "string" ? c : `${c.target}: ${c.from} → ${c.to}`
  ).filter(Boolean);

  const riskTexts = risks.map((r) =>
    typeof r === "string" ? r.trim() : itemText(r as AnyRecord)
  ).filter(Boolean);

  const hasContent =
    trend.recommended_focus ||
    carried.some((x) => itemText(x)) ||
    newItems.some((x) => itemText(x)) ||
    changeTexts.length ||
    riskTexts.length ||
    resolved.some((x) => itemText(x));

  return (
    <section className="mt-8">
      {header}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">

        {trend.previous_run_id && (
          <p className="text-xs text-gray-400">
            이전 run <code className="font-mono text-gray-500">{trend.previous_run_id}</code>
            {trend.previous_date && ` (${trend.previous_date})`} 기준 비교
          </p>
        )}

        {trend.recommended_focus && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
            <p className="text-xs font-semibold text-indigo-600 mb-1">이번 주 집중 포커스</p>
            <p className="text-sm text-indigo-900 leading-relaxed">{trend.recommended_focus}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Block label="이전부터 이어진 주의 항목" color="text-orange-600" items={carried} />
          <Block label="새로 추가된 주의 항목"      color="text-red-600"    items={newItems} />
          {changeTexts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-0.5">상태 변경 ({changeTexts.length})</p>
              <ul className="space-y-1 mt-1">
                {changeTexts.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="shrink-0 mt-0.5 text-blue-600">•</span>
                    <span className="text-gray-700">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {riskTexts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-600 mb-0.5">반복 리스크 ({riskTexts.length})</p>
              <ul className="space-y-1 mt-1">
                {riskTexts.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="shrink-0 mt-0.5 text-purple-600">•</span>
                    <span className="text-gray-700">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {resolved.map(itemText).filter(Boolean).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-green-600 mb-0.5">
              해결된 항목 ({resolved.map(itemText).filter(Boolean).length})
            </p>
            <ul className="space-y-1">
              {resolved.map(itemText).filter(Boolean).map((text, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-green-500 shrink-0">✓</span>
                  <span className="text-gray-600 line-through">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasContent && (
          <p className="text-sm text-gray-500 text-center py-2">변화 항목이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
