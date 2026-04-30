import type { Trend, AttentionItemV2 } from "@/lib/types";
import { Section } from "./shared";

function itemText(item: AttentionItemV2 | string): string {
  return typeof item === "string" ? item : item.item;
}

function ItemList({ items, color }: { items: Array<AttentionItemV2 | string>; color: string }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1 mt-1">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs">
          <span className={`shrink-0 mt-0.5 ${color}`}>•</span>
          <span className="text-gray-700">{itemText(it)}</span>
        </li>
      ))}
    </ul>
  );
}

function Block({ label, color, items }: {
  label: string;
  color: string;
  items: Array<AttentionItemV2 | string>;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className={`text-xs font-semibold ${color} mb-0.5`}>{label} ({items.length})</p>
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

  const carried  = trend.carried_over_attention_items  ?? [];
  const newItems = trend.new_attention_items           ?? [];
  const resolved = trend.resolved_attention_items      ?? [];
  const changes  = trend.status_changes                ?? [];
  const risks    = trend.repeated_risks                ?? [];

  return (
    <section className="mt-8">
      {header}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">

        {/* 이전 run 참조 */}
        {trend.previous_run_id && (
          <p className="text-xs text-gray-400">
            이전 run <code className="font-mono text-gray-500">{trend.previous_run_id}</code>
            {trend.previous_date && ` (${trend.previous_date})`} 기준 비교
          </p>
        )}

        {/* 1. 권고 포커스 — 최우선 */}
        {trend.recommended_focus && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
            <p className="text-xs font-semibold text-indigo-600 mb-1">이번 주 집중 포커스</p>
            <p className="text-sm text-indigo-900 leading-relaxed">{trend.recommended_focus}</p>
          </div>
        )}

        {/* 2–5. 항목 블록 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Block
            label="이전부터 이어진 주의 항목"
            color="text-orange-600"
            items={carried}
          />
          <Block
            label="새로 추가된 주의 항목"
            color="text-red-600"
            items={newItems}
          />
          <Block
            label="상태 변경"
            color="text-blue-600"
            items={changes.map((c) =>
              typeof c === "string" ? c : `${c.target}: ${c.from} → ${c.to}`
            )}
          />
          <Block
            label="반복 리스크"
            color="text-purple-600"
            items={risks.map((r) => r)}
          />
        </div>

        {/* 6. 해결된 항목 — 마지막 */}
        {resolved.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-green-600 mb-0.5">해결된 항목 ({resolved.length})</p>
            <ul className="space-y-1">
              {resolved.map((it, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-green-500 shrink-0">✓</span>
                  <span className="text-gray-600 line-through">{itemText(it)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 데이터는 있지만 모든 항목이 비어 있을 때 */}
        {!trend.recommended_focus && !carried.length && !newItems.length &&
          !changes.length && !risks.length && !resolved.length && (
          <p className="text-sm text-gray-500 text-center py-2">변화 항목이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
