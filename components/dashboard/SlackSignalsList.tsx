import type { SlackSignal } from "@/lib/types";
import { SignalBadge } from "./shared";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "신뢰도 높음", medium: "보통", low: "낮음",
};

interface Props {
  signals: SlackSignal[];
  title?: string;
  defaultCollapsed?: boolean;
}

export function SlackSignalsList({
  signals,
  title = "연결되지 않은 Slack 신호",
  defaultCollapsed = true,
}: Props) {
  if (!signals.length) return null;

  return (
    <details className="mt-6 group" open={!defaultCollapsed}>
      <summary className="cursor-pointer inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-gray-600 select-none list-none py-1">
        <span className="group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span>
        <span className="uppercase tracking-widest">
          {title} ({signals.length})
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-gray-400 mb-2">관련 workstream에 연결되지 않은 Slack 신호만 표시합니다.</p>
        {signals.map((s, i) => {
          const ss = s as unknown as Record<string, unknown>;
          const summary = s.summary ?? (ss.text as string) ?? "";
          return (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2"
            >
              <div className="shrink-0 pt-0.5">
                <SignalBadge type={s.type ?? (ss.signal_type as string) ?? "info"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{summary}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
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
          );
        })}
      </div>
    </details>
  );
}
