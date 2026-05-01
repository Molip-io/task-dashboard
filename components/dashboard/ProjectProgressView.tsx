import type { ProjectProgress, Workstream, ConfirmationNeeded, SlackSignal } from "@/lib/types";
import { SignalBadge, Section } from "./shared";

// ── Workstream status badge ────────────────────────────────────────────────────

const WS_STATUS_CLS: Record<string, string> = {
  "진행 중":   "bg-blue-100 text-blue-700",
  "완료":      "bg-green-100 text-green-700",
  "지연":      "bg-red-100 text-red-700",
  "임박":      "bg-orange-100 text-orange-700",
  "예정":      "bg-gray-100 text-gray-600",
  "QA":        "bg-purple-100 text-purple-700",
  "업로드대기": "bg-yellow-100 text-yellow-700",
  "리뷰":      "bg-indigo-100 text-indigo-700",
};

function WsStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = WS_STATUS_CLS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}

// ── Single workstream ─────────────────────────────────────────────────────────

function WorkstreamBlock({ ws }: { ws: Workstream }) {
  const w = ws as unknown as Record<string, unknown>;
  const label = (ws.label || (w.name as string) || (w.title as string) || "미분류").trim();
  const items: string[] = ws.items ?? (w.key_tasks as string[]) ?? (w.tasks as string[]) ?? [];
  const evidence = ws.evidence ?? (w.summary as string) ?? "";
  const nextAction = ws.next_action ?? (w.nextAction as string) ?? "";

  return (
    <div className="border-l-2 border-gray-200 pl-3 py-0.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <WsStatusBadge status={ws.status} />
      </div>
      {items.length > 0 && (
        <ul className="space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
              <span className="shrink-0 text-gray-400 mt-0.5">-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {nextAction && (
        <p className="mt-1.5 text-xs text-indigo-700 font-medium flex gap-1">
          <span className="shrink-0">→</span>
          <span>{nextAction}</span>
        </p>
      )}
      {evidence && (
        <p className="mt-1 text-xs text-gray-400 italic">{evidence}</p>
      )}
    </div>
  );
}

// ── Slack signals inside project ──────────────────────────────────────────────

function ProjectSlackSignals({ signals }: { signals: SlackSignal[] }) {
  if (!signals.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1.5">
        Slack 신호 ({signals.length})
      </p>
      <div className="space-y-1.5">
        {signals.map((s, i) => {
          const ss = s as unknown as Record<string, unknown>;
          const signalType = s.type ?? (ss.signal_type as string) ?? "info";
          const signalSummary = s.summary ?? (ss.text as string) ?? (ss.message as string) ?? "";
          if (!signalSummary) return null;
          const relatedWorkstream = s.related_workstream ?? (ss.workstream as string) ?? "";
          return (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
              <div className="shrink-0 pt-0.5">
                <SignalBadge type={signalType} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{signalSummary}</p>
                {(relatedWorkstream || s.related_task || s.channel) && (
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-500">
                    {relatedWorkstream && <span>↳ {relatedWorkstream}</span>}
                    {s.related_task && <span>↳ {s.related_task}</span>}
                    {s.channel && <span># {s.channel}</span>}
                  </div>
                )}
              </div>
              {s.confidence && (
                <span className="shrink-0 text-xs text-gray-400">
                  {s.confidence === "high" ? "높음" : s.confidence === "medium" ? "보통" : "낮음"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── needs_confirmation block ──────────────────────────────────────────────────

function ConfirmBlock({ items }: { items: ConfirmationNeeded[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5">
      <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-1.5">
        확인 필요 ({items.length})
      </p>
      <ul className="space-y-1.5">
        {items.map((c, i) => {
          const ci = c as unknown as Record<string, unknown>;
          const text = c.item || (ci.summary as string) || (ci.title as string) || "";
          const owner = c.owner || (ci.assignee as string) || "";
          if (!text) return null;
          return (
            <li key={i} className="text-sm">
              <span className="text-gray-800">{text}</span>
              {owner && (
                <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
                  {owner}
                </span>
              )}
              {c.reason && (
                <span className="ml-1.5 text-xs text-orange-600">{c.reason}</span>
              )}
              {c.requested_action && (
                <p className="mt-0.5 text-xs text-orange-700 pl-1 font-medium">
                  → {c.requested_action}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Single project card ───────────────────────────────────────────────────────

function ProjectCard({
  pp,
  isFallback,
}: {
  pp: ProjectProgress;
  isFallback: boolean;
}) {
  const workstreams  = pp.workstreams ?? [];
  const confirms     = pp.needs_confirmation ?? [];
  const risks        = pp.risks ?? [];
  const nextActions  = pp.next_actions ?? [];
  const slackSignals = pp.slack_signals ?? [];

  const hasRisk = confirms.length > 0 || risks.length > 0;

  return (
    <div
      className={`bg-white rounded-xl border-2 p-5 shadow-sm ${
        hasRisk ? "border-orange-300" : "border-gray-200"
      }`}
    >
      {/* 프로젝트명 + 요약 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-base">{pp.project}</h3>
          {(pp.current_summary ?? ((pp as unknown as Record<string, unknown>).summary as string)) && (
            <p className="text-sm text-gray-600 mt-0.5 leading-snug">
              {pp.current_summary ?? ((pp as unknown as Record<string, unknown>).summary as string)}
            </p>
          )}
        </div>
        {isFallback && (
          <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            자동 생성
          </span>
        )}
      </div>

      {/* Workstreams */}
      {workstreams.length > 0 && (
        <div className="space-y-3 mb-3">
          {workstreams.map((ws, i) => (
            <WorkstreamBlock key={i} ws={ws} />
          ))}
        </div>
      )}

      {/* 일정 메모 */}
      {pp.schedule_notes && (
        <div className="mt-3 text-sm text-gray-700">
          <span className="font-semibold text-gray-600 text-xs uppercase tracking-wide">
            일정 메모
          </span>
          <p className="mt-0.5 text-gray-700">{pp.schedule_notes}</p>
        </div>
      )}

      {/* 확인 필요 */}
      <ConfirmBlock items={confirms} />

      {/* Slack 신호 */}
      <ProjectSlackSignals signals={slackSignals} />

      {/* 리스크 */}
      {risks.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">리스크</p>
          <ul className="space-y-0.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-red-700">
                <span className="shrink-0">⚠</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 다음 액션 */}
      {nextActions.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">
            다음 액션
          </p>
          <ul className="space-y-0.5">
            {nextActions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-indigo-700">
                <span className="shrink-0">→</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  items: ProjectProgress[];
  isFallback?: boolean;
}

export function ProjectProgressView({ items, isFallback = false }: Props) {
  if (!items.length) {
    return (
      <Section title="프로젝트 진행 현황">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-8 text-center">
          <p className="text-sm text-gray-500">프로젝트 진행 현황이 없습니다.</p>
          {isFallback && (
            <p className="text-xs text-gray-400 mt-1">
              NOTION_TASK_DATABASE_ID 설정 후 작업이 수집되면 자동으로 표시됩니다.
            </p>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section title={`프로젝트 진행 현황 (${items.length})`}>
      {isFallback && (
        <p className="text-xs text-gray-400 mb-3">
          Agent payload의 project_progress가 없어 rawTasks 기반으로 자동 생성된 현황입니다.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((pp, i) => (
          <ProjectCard key={pp.project ?? i} pp={pp} isFallback={isFallback} />
        ))}
      </div>
    </Section>
  );
}
