import type { ProjectStatus, ProjectMetrics } from "@/lib/types";
import { StatusBadge, SignalBadge, UrgencyBadge, statusBorder, Section } from "./shared";

function MetricPill({ label, val, highlight }: { label: string; val: number; highlight?: boolean }) {
  if (val === 0 && !highlight) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      highlight && val > 0
        ? "bg-red-100 text-red-700"
        : "bg-gray-100 text-gray-600"
    }`}>
      {label} {val}
    </span>
  );
}

function ProjectMetricsRow({ m }: { m: ProjectMetrics }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {m.total_tasks !== undefined && (
        <span className="text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-500">
          전체 {m.total_tasks}
        </span>
      )}
      <MetricPill label="진행" val={m.active_tasks ?? 0} />
      <MetricPill label="임박" val={m.due_soon_tasks ?? 0} highlight />
      <MetricPill label="초과" val={m.overdue_tasks ?? 0} highlight />
      <MetricPill label="확인요청" val={m.confirm_request_tasks ?? 0} highlight />
      <MetricPill label="정지" val={m.paused_tasks ?? 0} highlight />
      <MetricPill label="병목" val={m.bottleneck_count ?? 0} highlight />
      <MetricPill label="주의" val={m.attention_count ?? 0} highlight />
    </div>
  );
}

export function ProjectStatusGrid({ projects }: { projects: ProjectStatus[] }) {
  if (!projects.length) {
    return (
      <Section title="프로젝트">
        <p className="text-sm text-gray-400 py-4">프로젝트 정보가 없습니다.</p>
      </Section>
    );
  }

  return (
    <Section title="프로젝트">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p, i) => (
          <div
            key={p.project_key ?? i}
            className={`bg-white rounded-xl border-2 ${statusBorder(p.status)} p-5 shadow-sm`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-gray-900 text-base leading-tight">{p.project_name}</h3>
              <StatusBadge status={p.status} />
            </div>

            {/* Metrics — 요약보다 먼저 */}
            {p.metrics && <ProjectMetricsRow m={p.metrics} />}

            {/* Summary */}
            {p.summary && (
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">{p.summary}</p>
            )}

            {/* Bottlenecks */}
            {!!p.key_bottlenecks?.length && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">병목</p>
                <ul className="space-y-0.5">
                  {p.key_bottlenecks.map((b, j) => (
                    <li key={j} className="text-sm text-gray-700 flex gap-1.5">
                      <span className="shrink-0 text-orange-400">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Attention items */}
            {!!p.attention_items?.length && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">확인 항목</p>
                {p.attention_items.map((a, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <UrgencyBadge urgency={a.urgency} />
                    <p className="text-sm text-gray-700 leading-snug">{a.item}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Slack signals */}
            {!!p.slack_signals?.length && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Slack 신호</p>
                {p.slack_signals.map((s, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <SignalBadge type={s.type} />
                    <p className="text-sm text-gray-600 leading-snug">{s.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
