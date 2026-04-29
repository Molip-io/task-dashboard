import type { SlackSignal } from "@/lib/types";
import { SignalBadge, Section } from "./shared";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "신뢰도 높음", medium: "보통", low: "낮음",
};

export function SlackSignalsList({ signals }: { signals: SlackSignal[] }) {
  if (!signals.length) return null;

  return (
    <Section title={`Slack 신호 (${signals.length})`}>
      <div className="space-y-2">
        {signals.map((s, i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2"
          >
            <div className="shrink-0 pt-0.5">
              <SignalBadge type={s.type} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 leading-snug">{s.summary}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
                {s.project && <span>📁 {s.project}</span>}
                {s.channel && <span># {s.channel}</span>}
                {s.related_task && <span>↳ {s.related_task}</span>}
              </div>
            </div>
            {s.confidence && (
              <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                {CONFIDENCE_LABEL[s.confidence] ?? s.confidence}
              </span>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
