"use client";

import { useState } from "react";
import type {
  ProjectProgress,
  ProjectDataHealth,
  Workstream,
  EvidenceSummary,
  SlackSignal,
  TrackBreakdownItem,
  FunctionBreakdownItem,
  OwnerBreakdownItem,
  DataConflict,
  StaleTask,
  ConfirmationNeeded,
} from "@/lib/types";
import { StatusBadge, SignalBadge, Section } from "./shared";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACK_LABELS: Record<string, string> = {
  planning:         "기획",
  development:      "개발",
  art:              "아트",
  uiux:             "UI/UX",
  qa:               "QA",
  operations:       "운영/업로드",
  marketing_cpi:    "CPI/마케팅",
  partner_feedback: "파트너 피드백",
};

const WS_STATUS_CLS: Record<string, string> = {
  "진행 중":   "bg-blue-100 text-blue-700",
  "완료":      "bg-green-100 text-green-700",
  "지연":      "bg-red-100 text-red-700",
  "임박":      "bg-orange-100 text-orange-700",
  "예정":      "bg-gray-100 text-gray-600",
  "QA":        "bg-purple-100 text-purple-700",
  "업로드대기": "bg-yellow-100 text-yellow-700",
  "리뷰":      "bg-indigo-100 text-indigo-700",
  "결정 필요": "bg-pink-100 text-pink-700",
  "착수 전":   "bg-gray-100 text-gray-500",
};

const INVALID_OWNERS = new Set([
  "확인 필요 담당자",
  "담당자 확인 필요",
  "담당자 미정",
  "unknown owner",
  "미기록 담당자",
  "미기록",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidOwner(owner?: string | null): boolean {
  if (!owner) return false;
  const t = owner.trim();
  return t.length > 0 && !INVALID_OWNERS.has(t);
}

function formatSummaryText(text?: string): string {
  if (!text) return "";
  const placeholders: string[] = [];
  const protected_ = text.replace(/\b\d+(?:\.\d+)+\b/g, (m) => {
    const key = `__VER_${placeholders.length}__`;
    placeholders.push(m);
    return key;
  });
  const broken = protected_.replace(/([.!?。！？])\s+/g, "$1\n");
  return placeholders.reduce(
    (acc, v, i) => acc.replace(`__VER_${i}__`, v),
    broken
  );
}

const STATUS_ORDER: Record<string, number> = {
  blocked: 0, risk: 1, watch: 2, normal: 3,
};

function sortProjectsByPriority(items: ProjectProgress[]): ProjectProgress[] {
  return [...items].sort((a, b) => {
    const pa = a.priority_score ?? 0;
    const pb = b.priority_score ?? 0;
    if (pa !== pb) return pb - pa;
    const sa = STATUS_ORDER[a.status ?? "normal"] ?? 3;
    const sb = STATUS_ORDER[b.status ?? "normal"] ?? 3;
    if (sa !== sb) return sa - sb;
    const ca =
      (Array.isArray(a.confirmation_queue) ? a.confirmation_queue.length : 0) +
      (Array.isArray(a.needs_confirmation) ? a.needs_confirmation.length : 0);
    const cb =
      (Array.isArray(b.confirmation_queue) ? b.confirmation_queue.length : 0) +
      (Array.isArray(b.needs_confirmation) ? b.needs_confirmation.length : 0);
    return cb - ca;
  });
}

function defaultSelectedIndex(sorted: ProjectProgress[]): number {
  const rankOne = sorted.findIndex((p) => p.priority_rank === 1);
  if (rankOne >= 0) return rankOne;
  return 0;
}

// ── Primitive badges ──────────────────────────────────────────────────────────

function WsStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = WS_STATUS_CLS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}

// ── Data Health ───────────────────────────────────────────────────────────────

function DataHealthBadge({ health }: { health: ProjectDataHealth }) {
  const score = health.confidence_score;
  const status = health.status;
  const cls =
    status === "high"
      ? "text-green-600"
      : status === "medium"
      ? "text-yellow-600"
      : "text-red-600";
  return (
    <details className="mt-2">
      <summary className="text-xs cursor-pointer text-gray-400 hover:text-gray-600">
        데이터 신뢰도: <span className={cls}>{status ?? "unknown"}</span>
        {score !== undefined && ` · confidence ${score}`}
      </summary>
      <div className="mt-1 text-xs text-gray-500 pl-2 space-y-0.5">
        {health.notion_task_coverage && <p>Notion 업무: {health.notion_task_coverage}</p>}
        {health.slack_signal_coverage && <p>Slack 신호: {health.slack_signal_coverage}</p>}
        {health.owner_mapping && <p>담당자 매칭: {health.owner_mapping}</p>}
        {health.schedule_coverage && <p>일정 정보: {health.schedule_coverage}</p>}
        {(health.conflict_count ?? 0) > 0 && <p>불일치: {health.conflict_count}</p>}
        {(health.stale_task_count ?? 0) > 0 && <p>오래된 업무: {health.stale_task_count}</p>}
        {health.notes?.map((n, i) => (
          <p key={i} className="text-gray-400 italic">{n}</p>
        ))}
      </div>
    </details>
  );
}

// ── Evidence badge (collapsible) ──────────────────────────────────────────────

function EvidenceBadge({ ws }: { ws: Workstream }) {
  const evObj =
    typeof ws.evidence === "object" && ws.evidence !== null
      ? (ws.evidence as EvidenceSummary)
      : null;
  const notionCount =
    evObj?.notion_count ?? ws.evidence_summary?.notion_count ?? 0;
  const slackCount =
    evObj?.slack_count ?? ws.evidence_summary?.slack_count ?? 0;
  const confidence =
    evObj?.confidence ?? ws.evidence_summary?.confidence;

  if (notionCount === 0 && slackCount === 0) return null;

  return (
    <details className="mt-1">
      <summary className="text-xs cursor-pointer text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
        <span>근거:</span>
        {notionCount > 0 && <span>Notion {notionCount}</span>}
        {notionCount > 0 && slackCount > 0 && <span>·</span>}
        {slackCount > 0 && <span>Slack {slackCount}</span>}
        {confidence && confidence !== "unknown" && (
          <span>· 신뢰도 {confidence}</span>
        )}
        <span className="ml-1 underline">근거 보기</span>
      </summary>
      <div className="mt-1 pl-2 text-xs text-gray-500 space-y-1">
        {(evObj?.combined_summary || ws.evidence_summary?.combined_summary) && (
          <p>
            {evObj?.combined_summary ?? ws.evidence_summary?.combined_summary}
          </p>
        )}
        {typeof ws.evidence === "string" && ws.evidence && (
          <p className="italic">{ws.evidence}</p>
        )}
      </div>
    </details>
  );
}

// ── Breakdown sections ────────────────────────────────────────────────────────

function TrackBreakdownSection({ tracks }: { tracks: TrackBreakdownItem[] }) {
  const visible = tracks.filter(
    (t) =>
      t.summary ||
      (t.owners?.length ?? 0) > 0 ||
      (t.status && t.status !== "unknown")
  );
  if (!visible.length) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
      {visible.map((t, i) => {
        const validOwners = (t.owners ?? []).filter(isValidOwner);
        const meta = [
          t.summary,
          validOwners.length ? `담당: ${validOwners.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-24 text-gray-500 font-medium">
              {TRACK_LABELS[t.track] ?? t.track}
            </span>
            {t.status && t.status !== "unknown" && (
              <WsStatusBadge status={t.status} />
            )}
            {meta && (
              <span className="text-gray-600 flex-1 leading-snug">{meta}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FunctionBreakdownSection({
  functions,
}: {
  functions: FunctionBreakdownItem[];
}) {
  if (!functions.length) return null;
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <p className="text-xs font-semibold text-gray-400 mb-1">기능별</p>
      <ul className="space-y-0.5">
        {functions.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs">
            <span className="shrink-0 text-gray-300">-</span>
            <span className="text-gray-700">
              <span className="font-medium">{f.function}</span>
              {f.status && <WsStatusBadge status={f.status} />}
              {f.summary && (
                <span className="text-gray-500 ml-1">{f.summary}</span>
              )}
              {f.next_action && (
                <span className="text-indigo-600 ml-1">
                  → {f.next_action}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OwnerBreakdownSection({
  owners,
}: {
  owners: OwnerBreakdownItem[];
}) {
  const valid = owners.filter((o) => isValidOwner(o.owner));
  if (!valid.length) return null;
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <p className="text-xs font-semibold text-gray-400 mb-1">작업자별</p>
      <ul className="space-y-0.5">
        {valid.map((o, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
            <span className="shrink-0 text-gray-400">👤</span>
            <span>
              <span className="font-medium">{o.owner}</span>
              {o.status && (
                <span className="text-gray-400 ml-1">({o.status})</span>
              )}
              {o.summary && (
                <span className="text-gray-500 ml-1">— {o.summary}</span>
              )}
              {(o.tasks?.length ?? 0) > 0 && (
                <span className="text-gray-400 ml-1">
                  [{o.tasks!.slice(0, 2).join(", ")}
                  {o.tasks!.length > 2 ? ` +${o.tasks!.length - 2}` : ""}]
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InlineSlackSignals({ signals }: { signals: SlackSignal[] }) {
  if (!signals.length) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
      {signals.map((s, i) => {
        const ss = s as unknown as Record<string, unknown>;
        const summary = s.summary ?? (ss.text as string) ?? "";
        if (!summary) return null;
        const relatedWs =
          s.related_workstream ?? (ss.workstream as string) ?? "";
        return (
          <div key={i} className="flex items-start gap-1.5">
            <SignalBadge
              type={s.type ?? (ss.signal_type as string) ?? "info"}
            />
            <div className="text-xs text-gray-600 leading-snug">
              <span>{summary}</span>
              {relatedWs && (
                <span className="text-gray-400 ml-1">↳ {relatedWs}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Workstream card ───────────────────────────────────────────────────────────

function WorkstreamCard({ ws }: { ws: Workstream }) {
  const w = ws as unknown as Record<string, unknown>;
  const label = (
    ws.label ||
    (w.name as string) ||
    (w.title as string) ||
    "미분류"
  ).trim();

  const combinedSummary =
    ws.display_summary ??
    ws.combined_summary ??
    ws.evidence_summary?.combined_summary ??
    (w.summary as string) ??
    (typeof ws.evidence === "string" ? ws.evidence : undefined) ??
    "";
  const nextAction = ws.next_action ?? (w.nextAction as string) ?? "";
  const items: string[] =
    ws.items ?? (w.key_tasks as string[]) ?? (w.tasks as string[]) ?? [];
  const tracks = Array.isArray(ws.track_breakdown) ? ws.track_breakdown : [];
  const functions = Array.isArray(ws.function_breakdown)
    ? ws.function_breakdown
    : [];
  const ownerBreakdown = Array.isArray(ws.owner_breakdown)
    ? ws.owner_breakdown
    : [];
  const inlineSignals = Array.isArray(ws.slack_signals)
    ? ws.slack_signals
    : [];

  return (
    <div className="border-l-2 border-gray-200 pl-3 py-1">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <WsStatusBadge status={ws.status} />
      </div>

      {combinedSummary && (
        <div className="text-sm text-gray-700 whitespace-pre-line leading-snug">
          {formatSummaryText(combinedSummary)}
        </div>
      )}

      {items.length > 0 && !combinedSummary && (
        <ul className="mt-1 space-y-0.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-sm text-gray-700"
            >
              <span className="shrink-0 text-gray-400 mt-0.5">-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <EvidenceBadge ws={ws} />
      <TrackBreakdownSection tracks={tracks} />
      <FunctionBreakdownSection functions={functions} />
      <OwnerBreakdownSection owners={ownerBreakdown} />
      <InlineSlackSignals signals={inlineSignals} />

      {nextAction && (
        <p className="mt-1.5 text-xs text-indigo-700 font-medium flex gap-1">
          <span className="shrink-0">→</span>
          <span>{nextAction}</span>
        </p>
      )}
    </div>
  );
}

// ── CEO Actions / confirmation queue ─────────────────────────────────────────

function CeoActionsSection({ pp }: { pp: ProjectProgress }) {
  const ceoActions = pp.ceo_actions;
  const confirmQueue = Array.isArray(pp.confirmation_queue)
    ? pp.confirmation_queue
    : [];

  const todayItems = Array.isArray(ceoActions?.today)
    ? ceoActions!.today
    : confirmQueue.filter((c) => c.timing === "today").map((c) => c.item);
  const weekItems = Array.isArray(ceoActions?.this_week)
    ? ceoActions!.this_week
    : confirmQueue
        .filter((c) => c.timing === "this_week")
        .map((c) => c.item);
  const watchItems = Array.isArray(ceoActions?.watch)
    ? ceoActions!.watch
    : confirmQueue.filter((c) => c.timing === "watch").map((c) => c.item);

  const hasQueueData =
    todayItems.length > 0 || weekItems.length > 0 || watchItems.length > 0;
  const legacyItems: ConfirmationNeeded[] = !hasQueueData
    ? (pp.needs_confirmation ?? [])
    : [];
  const hasAny = hasQueueData || legacyItems.length > 0;
  if (!hasAny) return null;

  return (
    <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 mt-3">
      <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-2">
        대표 액션
      </p>

      {todayItems.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-red-600 mb-1">오늘 확인할 것</p>
          <ul className="space-y-1">
            {todayItems.map((item, i) => (
              <li key={i} className="flex gap-1 text-xs text-gray-800">
                <span className="text-red-400 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {weekItems.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-orange-600 mb-1">
            이번 주 결정할 것
          </p>
          <ul className="space-y-1">
            {weekItems.map((item, i) => (
              <li key={i} className="flex gap-1 text-xs text-gray-800">
                <span className="text-orange-400 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {watchItems.length > 0 && (
        <div className="mb-1">
          <p className="text-xs font-semibold text-gray-500 mb-1">관찰할 것</p>
          <ul className="space-y-1">
            {watchItems.map((item, i) => (
              <li key={i} className="flex gap-1 text-xs text-gray-600">
                <span className="text-gray-300 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {legacyItems.length > 0 && (
        <ul className="space-y-1.5">
          {legacyItems.map((c, i) => {
            const ci = c as unknown as Record<string, unknown>;
            const text = c.item || (ci.summary as string) || "";
            if (!text) return null;
            const owner = c.owner || (ci.assignee as string) || "";
            const validOwner = isValidOwner(owner) ? owner : "";
            return (
              <li key={i} className="text-xs">
                <span className="text-gray-800">{text}</span>
                {validOwner && (
                  <span className="ml-1.5 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
                    {validOwner}
                  </span>
                )}
                {c.reason && (
                  <span className="ml-1 text-orange-600"> — {c.reason}</span>
                )}
                {c.requested_action && (
                  <p className="mt-0.5 pl-1 text-indigo-700 font-medium">
                    → {c.requested_action}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Data conflicts ────────────────────────────────────────────────────────────

function DataConflictsSection({ conflicts }: { conflicts: DataConflict[] }) {
  if (!conflicts.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1">
        데이터 불일치 ({conflicts.length})
      </p>
      <div className="space-y-2">
        {conflicts.map((c, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 border text-xs ${
              c.severity === "high"
                ? "bg-red-50 border-red-200"
                : c.severity === "medium"
                ? "bg-orange-50 border-orange-200"
                : "bg-yellow-50 border-yellow-200"
            }`}
          >
            {c.interpretation && (
              <p className="font-semibold text-gray-700 mb-0.5">
                {c.interpretation}
              </p>
            )}
            {(c.summary ?? c.description) && (
              <p className="text-gray-600">{c.summary ?? c.description}</p>
            )}
            {c.recommended_action && (
              <p className="mt-1 text-indigo-600 font-medium">
                → {c.recommended_action}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stale tasks ───────────────────────────────────────────────────────────────

function StaleTasksSection({ tasks }: { tasks: StaleTask[] }) {
  if (!tasks.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
        오래된 진행 업무
      </p>
      <ul className="space-y-0.5">
        {tasks.map((t, i) => (
          <li key={i} className="flex items-start gap-1 text-xs text-gray-600">
            <span className="shrink-0 text-gray-300">⏱</span>
            <span>
              <span className="font-medium">{t.task_name}</span>
              {t.days_since_update !== undefined && (
                <span className="text-gray-400">
                  {" "}· 최근 수정 {t.days_since_update}일 전
                </span>
              )}
              {t.status && (
                <span className="text-gray-400">, {t.status} 상태 유지</span>
              )}
              {t.recommended_action && (
                <span className="text-indigo-600 ml-1">
                  → {t.recommended_action}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Project detail panel ──────────────────────────────────────────────────────

function ProjectDetail({
  pp,
  isFallback,
}: {
  pp: ProjectProgress;
  isFallback: boolean;
}) {
  const displaySummary =
    pp.display_summary ??
    pp.current_summary ??
    pp.summary ??
    "";
  const workstreams = Array.isArray(pp.workstreams) ? pp.workstreams : [];
  const risks = Array.isArray(pp.risks) ? pp.risks : [];
  const nextActions = Array.isArray(pp.next_actions) ? pp.next_actions : [];
  const dataConflicts = Array.isArray(pp.data_conflicts)
    ? pp.data_conflicts
    : [];
  const staleTasks = Array.isArray(pp.stale_tasks) ? pp.stale_tasks : [];

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {pp.priority_rank !== undefined && (
              <span className="text-xs font-bold text-gray-400">
                #{pp.priority_rank}
              </span>
            )}
            <h3 className="font-bold text-gray-900 text-base">{pp.project}</h3>
            {pp.status && <StatusBadge status={pp.status} size="xs" />}
            {isFallback && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                자동 생성
              </span>
            )}
            {pp.priority_score !== undefined && (
              <span className="text-xs text-gray-400">
                {pp.priority_score}점
              </span>
            )}
            {pp.confidence_score !== undefined && (
              <span className="text-xs text-gray-400">
                신뢰도 {pp.confidence_score}
              </span>
            )}
          </div>
          {pp.priority_reason && (
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              {pp.priority_reason}
            </p>
          )}
          {displaySummary && (
            <div className="text-sm text-gray-600 mt-1 leading-snug whitespace-pre-line">
              {formatSummaryText(displaySummary)}
            </div>
          )}
        </div>
      </div>

      {/* Data Health */}
      {pp.project_data_health && (
        <DataHealthBadge health={pp.project_data_health} />
      )}

      {/* CEO Actions */}
      <CeoActionsSection pp={pp} />

      {/* Workstreams */}
      {workstreams.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            Workstream
          </p>
          {workstreams.map((ws, i) => (
            <WorkstreamCard key={i} ws={ws} />
          ))}
        </div>
      )}

      {/* Schedule notes */}
      {pp.schedule_notes && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            일정 메모
          </p>
          <p className="mt-0.5 text-sm text-gray-700">{pp.schedule_notes}</p>
        </div>
      )}

      {/* Data conflicts */}
      <DataConflictsSection conflicts={dataConflicts} />

      {/* Stale tasks */}
      <StaleTasksSection tasks={staleTasks} />

      {/* Risks */}
      {risks.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">
            리스크
          </p>
          <ul className="space-y-0.5">
            {risks.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-sm text-red-700"
              >
                <span className="shrink-0">⚠</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next actions */}
      {nextActions.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">
            다음 액션
          </p>
          <ul className="space-y-0.5">
            {nextActions.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-sm text-indigo-700"
              >
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
  const sorted = sortProjectsByPriority(items);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    defaultSelectedIndex(sorted)
  );

  if (!items.length) {
    return (
      <Section title="프로젝트 진행 판단">
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

  const safeIndex = Math.min(selectedIndex, sorted.length - 1);
  const selected = sorted[safeIndex];

  return (
    <Section title={`프로젝트 진행 판단 (${sorted.length})`}>
      {isFallback && (
        <p className="text-xs text-gray-400 mb-3">
          Agent payload의 project_progress가 없어 rawTasks 기반으로 자동 생성된
          현황입니다.
        </p>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Left: project list */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="space-y-1">
            {sorted.map((pp, i) => {
              const priorityScore = pp.priority_score;
              const priorityRank = pp.priority_rank;
              const priorityReason = pp.priority_reason;
              const confirmCount =
                (Array.isArray(pp.confirmation_queue)
                  ? pp.confirmation_queue.length
                  : 0) +
                (Array.isArray(pp.needs_confirmation)
                  ? pp.needs_confirmation.length
                  : 0);
              const riskCount = Array.isArray(pp.risks) ? pp.risks.length : 0;
              const conflictCount = Array.isArray(pp.data_conflicts)
                ? pp.data_conflicts.length
                : 0;
              const isSelected = i === safeIndex;

              return (
                <button
                  key={pp.project ?? i}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                    isSelected
                      ? "bg-indigo-50 border border-indigo-200"
                      : "bg-white border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {priorityRank !== undefined && (
                      <span className="text-xs font-bold text-gray-400">
                        #{priorityRank}
                      </span>
                    )}
                    <span
                      className={`text-sm font-semibold ${
                        isSelected ? "text-indigo-900" : "text-gray-800"
                      }`}
                    >
                      {pp.project}
                    </span>
                    {pp.status && (
                      <StatusBadge status={pp.status} size="xs" />
                    )}
                  </div>
                  {priorityScore !== undefined && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {priorityScore}점
                    </p>
                  )}
                  {priorityReason && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-snug">
                      {priorityReason}
                    </p>
                  )}
                  {(confirmCount > 0 ||
                    riskCount > 0 ||
                    conflictCount > 0) && (
                    <div className="flex gap-2 mt-1 text-xs text-gray-400">
                      {confirmCount > 0 && (
                        <span className="text-orange-600 font-medium">
                          확인 {confirmCount}
                        </span>
                      )}
                      {riskCount > 0 && (
                        <span className="text-red-600 font-medium">
                          리스크 {riskCount}
                        </span>
                      )}
                      {conflictCount > 0 && (
                        <span className="text-orange-400">
                          불일치 {conflictCount}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: detail */}
        {selected && (
          <ProjectDetail pp={selected} isFallback={isFallback} />
        )}
      </div>
    </Section>
  );
}
