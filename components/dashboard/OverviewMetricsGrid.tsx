import type { OverviewMetrics } from "@/lib/types";
import { Section } from "./shared";

interface Chip {
  key: keyof OverviewMetrics;
  label: string;
  highlight?: (v: number) => boolean;
  highlightCls?: string;
}

const CHIPS: Chip[] = [
  { key: "total_tasks",          label: "전체" },
  { key: "active_tasks",         label: "진행 중" },
  { key: "planned_tasks",        label: "예정" },
  { key: "completed_tasks",      label: "완료" },
  { key: "overdue_tasks",        label: "마감 초과", highlight: (v) => v > 0, highlightCls: "bg-red-50 border-red-300 text-red-700 font-bold" },
  { key: "due_soon_tasks",       label: "임박",      highlight: (v) => v > 0, highlightCls: "bg-orange-50 border-orange-300 text-orange-700 font-bold" },
  { key: "high_priority_tasks",  label: "0/1순위" },
  { key: "bottleneck_count",     label: "병목",       highlight: (v) => v > 0, highlightCls: "bg-yellow-50 border-yellow-300 text-yellow-700 font-bold" },
];

export function OverviewMetricsGrid({ metrics }: { metrics: OverviewMetrics }) {
  const defined = CHIPS.filter(({ key }) => metrics[key] !== undefined);
  if (!defined.length) return null;

  return (
    <Section title="전체 지표">
      <div className="flex flex-wrap gap-2">
        {defined.map(({ key, label, highlight, highlightCls }) => {
          const val = metrics[key] ?? 0;
          const isHighlighted = highlight?.(val) ?? false;
          const baseCls = isHighlighted
            ? highlightCls ?? "bg-red-50 border-red-300 text-red-700"
            : "bg-white border-gray-200 text-gray-700";
          return (
            <div
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${baseCls}`}
            >
              <span className="font-bold tabular-nums">{val}</span>
              <span className="text-xs opacity-80">{label}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
