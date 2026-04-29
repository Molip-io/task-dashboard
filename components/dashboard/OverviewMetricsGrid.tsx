import type { OverviewMetrics } from "@/lib/types";
import { Section } from "./shared";

interface MetricCardDef {
  key: keyof OverviewMetrics;
  label: string;
  highlight?: (v: number) => boolean;
  icon: string;
}

const CARDS: MetricCardDef[] = [
  { key: "total_tasks",            label: "전체 작업",   icon: "📋" },
  { key: "active_tasks",           label: "진행 중",     icon: "▶️" },
  { key: "planned_tasks",          label: "진행 예정",   icon: "📅" },
  { key: "completed_tasks",        label: "완료",        icon: "✅" },
  { key: "due_soon_tasks",         label: "마감 임박",   icon: "⏰", highlight: (v) => v > 0 },
  { key: "overdue_tasks",          label: "마감 초과",   icon: "🔴", highlight: (v) => v > 0 },
  { key: "confirm_request_tasks",  label: "확인 요청",   icon: "❓", highlight: (v) => v > 0 },
  { key: "paused_tasks",           label: "일시 정지",   icon: "⏸",  highlight: (v) => v > 0 },
  { key: "high_priority_tasks",    label: "0/1순위",     icon: "🔥" },
  { key: "bottleneck_count",       label: "병목 후보",   icon: "🚧", highlight: (v) => v > 0 },
  { key: "risk_count",             label: "리스크",      icon: "⚠️" },
  { key: "attention_count",        label: "오늘 확인",   icon: "👁",  highlight: (v) => v > 0 },
];

export function OverviewMetricsGrid({ metrics }: { metrics: OverviewMetrics }) {
  return (
    <Section title="전체 지표">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {CARDS.map(({ key, label, icon, highlight }) => {
          const val = metrics[key] ?? 0;
          const isHighlighted = highlight?.(val) ?? false;
          return (
            <div
              key={key}
              className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                isHighlighted
                  ? "bg-red-50 border-red-200"
                  : "bg-white border-gray-100"
              }`}
            >
              <div className="text-lg mb-0.5">{icon}</div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  isHighlighted ? "text-red-600" : "text-gray-800"
                }`}
              >
                {val}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
