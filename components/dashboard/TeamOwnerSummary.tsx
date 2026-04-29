import type { TeamStatus, OwnerStatus } from "@/lib/types";
import { StatusBadge, UrgencyBadge, statusBorder, Section } from "./shared";

function MetricRow({ metrics }: { metrics: Record<string, number> }) {
  const entries = Object.entries(metrics).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {entries.map(([k, v]) => (
        <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {k} {v}
        </span>
      ))}
    </div>
  );
}

export function TeamOwnerSummary({
  teams = [],
  owners = [],
}: {
  teams?: TeamStatus[];
  owners?: OwnerStatus[];
}) {
  if (!teams.length && !owners.length) return null;

  return (
    <>
      {/* Teams */}
      {teams.length > 0 && (
        <Section title="팀별 현황">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((t, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border-2 ${statusBorder(t.status)} p-4 shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{t.team_name}</h3>
                  <StatusBadge status={t.status} size="xs" />
                </div>
                {t.metrics && <MetricRow metrics={t.metrics} />}
                {t.summary && (
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">{t.summary}</p>
                )}
                {!!t.attention_items?.length && (
                  <div className="mt-2 space-y-1">
                    {t.attention_items.map((a, j) => (
                      <div key={j} className="flex items-start gap-1.5">
                        <UrgencyBadge urgency={a.urgency} />
                        <span className="text-xs text-gray-700">{a.item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Owners — 쏠림/지원 필요 관점 */}
      {owners.length > 0 && (
        <Section title="담당자 현황 — 업무 쏠림 · 지원 필요">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {owners.map((o, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border-2 ${statusBorder(o.status)} p-4 shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">👤 {o.owner}</h3>
                  <StatusBadge status={o.status} size="xs" />
                </div>
                {o.metrics && <MetricRow metrics={o.metrics} />}
                {o.summary && (
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">{o.summary}</p>
                )}
                {!!o.notable_load?.length && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-orange-600 mb-1">집중 업무</p>
                    <ul className="space-y-0.5">
                      {o.notable_load.map((l, j) => (
                        <li key={j} className="text-xs text-gray-700 flex gap-1">
                          <span className="text-orange-400 shrink-0">•</span>
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
