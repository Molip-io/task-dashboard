"use client";

import { useState } from "react";
import type {
  ProjectProgress,
  Workstream,
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

const SEVERITY_CLS: Record<string, string> = {
  low:    "bg-yellow-50 border-yellow-200 text-yellow-700",
  medium: "bg-orange-50 border-orange-200 text-orange-700",
  high:   "bg-red-50 border-red-200 text-red-700",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "낮음", medium: "보통", high: "높음",
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

function defaultSelectedIndex(items: ProjectProgress[]): number {
  const score = (pp: ProjectProgress): number => {
    const st = pp.status;
    if (st === "blocked") return 0;
    if (st === "risk") return 1;
    const cq = pp.confirmation_queue?.length ?? pp.needs_confirmation?.length ?? 0;
    if (st === "watch" || cq > 0) return 2;
    return 3;
  };
  let best = 0;
  for (let i = 1; i < items.length; i++) {
    if (score(items[i]) < score(items[best])) best = i;
  }
  return best;
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

function EvidenceBadge({
  notionCount, slackCount, confidence,
}: {
  notionCount: number;
  slackCount: number;
  confidence?: string;
}) {
  if (notionCount === 0 && slackCount === 0) return null;
  const conf = confidence && confidence !== "unknown" ? confidence : null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
      {notionCount > 0 && <span>Notion {notionCount}</span>}
      {notionCount > 0 && slackCount > 0 && <span>·</span>}
      {slackCount > 0 && <span>Slack {slackCount}</span>}
      {conf && <><span>·</span><span>신뢰도 {conf}</span></>}
    </span>
  );
}

// ── Breakdown sections ────────────────────────────────────────────────────────

function TrackBreakdownSection({ tracks }: { tracks: TrackBreakdownItem[] }) {
  const visible = tracks.filter(
    (t) => t.summary || (t.owners?.length ?? 0) > 0 || (t.status && t.status !== "unknown")
  );
  if (!visible.length) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
      {visible.map((t, i) => {
        const validOwners = (t.owners ?? []).filter(isValidOwner);
        const meta = [t.summary, validOwners.length ? `담당: ${validOwners.join(", ")}` : ""]
          .filter(Boolean).join(" · ");
        return (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-24 text-gray-500 font-medium">
              {TRACK_LABELS[t.track] ?? t.track}
            </span>
            {t.status && t.status !== "unknown" && <WsStatusBadge status={t.status} />}
            {meta && <span className="text-gray-600 flex-1 leading-snug">{meta}</span>}
          </div>
        );
      })}
    </div>
  );
}

function FunctionBreakdownSection({ functions }: { functions: FunctionBreakdownItem[] }) {
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
              {f.summary && <span className="text-gray-500 ml-1">{f.summary}</span>}
              {f.next_action && <span className="text-indigo-600 ml-1">→ {f.next_action}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OwnerBreakdownSection({ owners }: { owners: OwnerBreakdownItem[] }) {
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
              {o.status && <span className="text-gray-400 ml-1">({o.status})</span>}
              {o.summary && <span className="text-gray-500 ml-1">— {o.summary}</span>}
              {(o.tasks?.length ?? 0) > 0 && (
                <span className="text-gray-400 ml-1">
                  [{o.tasks!.slice(0, 2).join(", ")}{(o.tasks!.length > 2 ? ` +${o.tasks!.length - 2}` : "")}]
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
        const relatedWs = s.related_workstream ?? (ss.workstream as string) ?? "";
        return (
          <div key={i} className="flex items-start gap-1.5">
            <SignalBadge type={s.type ?? (ss.signal_type as string) ?? "info"} />
            <div className="text-xs text-gray-600 leading-snug">
              <span>{summary}</span>
              {relatedWs && <span className="text-gray-400 ml-1">↳ {relatedWs}</span>}
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
  const label = (ws.label || (w.name as string) || (w.title as string) || "미분류").trim();

  const combinedSummary =
    ws.display_summary ??
    ws.combined_summary ??
    ws.evidence_summary?.combined_summary ??
    (w.summary as string) ??
    ws.evidence ??
    "";
  const nextAction = ws.next_action ?? (w.nextAction as string) ?? "";
  const items: string[] = ws.items ?? (w.key_tasks as string[]) ?? (w.tasks as string[]) ?? [];
  const notionCount = ws.evidence_summary?.notion_count ?? 0;
  const slackCount = ws.evidence_summary?.slack_count ?? 0;
  const confidence = ws.evidence_summary?.confidence;
  const tracks = ws.track_breakdown ?? [];
  const functions = ws.function_breakdown ?? [];
  const ownerBreakdown = ws.owner_breakdown ?? [];
  const inlineSignals = ws.slack_signals ?? [];

  return (
    <div className="border-l-2 border-gray-200 pl-3 py-1">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <WsStatusBadge status={ws.status} />
        <EvidenceBadge notionCount={notionCount} slackCount={slackCount} confidence={confidence} />
      </div>

      {combinedSummary && (
        <div className="text-sm text-gray-700 whitespace-pre-line leading-snug">
          {formatSummaryText(combinedSummary)}
        </div>
      )}

      {items.length > 0 && !combinedSummary && (
        <ul className="mt-1 space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
              <span className="shrink-0 text-gray-400 mt-0.5">-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

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
  const confirmQueue = pp.confirmation_queue ?? [];

  const todayItems  = ceoActions?.today      ?? confirmQueue.filter((c) => c.timing === "today").map((c) => c.item);
  const weekItems   = ceoActions?.this_week  ?? confirmQueue.filter((c) => c.timing === "this_week").map((c) => c.item);
  const watchItems  = ceoActions?.watch      ?? confirmQueue.filter((c) => c.timing === "watch").map((c) => c.item);

  const hasQueueData = todayItems.length > 0 || weekItems.length > 0 || watchItems.length > 0;
  const legacyItems: ConfirmationNeeded[] = !hasQueueData ? (pp.needs_confirmation ?? []) : [];
  const hasAny = hasQueueData || legacyItems.length > 0;
  if (!hasAny) return null;

  return (
    <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 mt-3">
      <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-2">대표 액션</p>

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
          <p className="text-xs font-semibold text-orange-600 mb-1">이번 주 결정할 것</p>
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
                {c.reason && <span className="ml-1 text-orange-600"> — {c.reason}</span>}
                {c.requested_action && (
                  <p className="mt-0.5 pl-1 text-indigo-700 font-medium">→ {c.requested_action}</p>
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
      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1">데이터 불일치</p>
      <ul className="space-y-1">
        {conflicts.map((c, i) => {
          const sev = c.severity ?? "medium";
          const cls = SEVERITY_CLS[sev] ?? SEVERITY_CLS.medium;
          return (
            <li key={i} className={`text-xs rounded px-2 py-1 border ${cls} flex items-start gap-1.5`}>
              <span className="shrink-0 font-semibold">{SEVERITY_LABEL[sev] ?? sev}</span>
              <span>{c.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Stale tasks ───────────────────────────────────────────────────────────────

function StaleTasksSection({ tasks }: { tasks: StaleTask[] }) {
  if (!tasks.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">오래된 진행 업무</p>
      <ul className="space-y-0.5">
        {tasks.map((t, i) => (
          <li key={i} className="flex items-start gap-1 text-xs text-gray-600">
            <span className="shrink-0 text-gray-300">⏱</span>
            <span>
              <span className="font-medium">{t.task_name}</span>
              {t.days_since_update !== undefined && (
                <span className="text-gray-400"> · 최근 수정 {t.days_since_update}일 전</span>
              )}
              {t.status && <span className="text-gray-400">, {t.status} 상태 유지</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Project detail panel ──────────────────────────────────────────────────────

function ProjectDetail({ pp, isFallback }: { pp: ProjectProgress; isFallback: boolean }) {
  const ppAny = pp as unknown as Record<string, unknown>;
  const displaySummary =
    pp.display_summary ??
    pp.current_summary ??
    (ppAny.summary as string) ??
    "";
  const workstreams = pp.workstreams ?? [];
  const risks = pp.risks ?? [];
  const nextActions = pp.next_actions ?? [];
  const dataConflicts = pp.data_conflicts ?? [];
  const staleTasks = pp.stale_tasks ?? [];

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-base">{pp.project}</h3>
            {pp.status && <StatusBadge status={pp.status} size="xs" />}
            {isFallback && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">자동 생성</span>
            )}
          </div>
          {displaySummary && (
            <div className="text-sm text-gray-600 mt-1 leading-snug whitespace-pre-line">
              {formatSummaryText(displaySummary)}
            </div>
          )}
        </div>
      </div>

      {/* CEO Actions */}
      <CeoActionsSection pp={pp} />

      {/* Workstreams */}
      {workstreams.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Workstream</p>
          {workstreams.map((ws, i) => (
            <WorkstreamCard key={i} ws={ws} />
          ))}
        </div>
      )}

      {/* Schedule notes */}
      {pp.schedule_notes && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">일정 메모</p>
          <p className="mt-0.5 text-sm text-gray-700">{pp.schedule_notes}</p>
        </div>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">리스크</p>
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

      {/* Data conflicts */}
      <DataConflictsSection conflicts={dataConflicts} />

      {/* Stale tasks */}
      <StaleTasksSection tasks={staleTasks} />

      {/* Next actions */}
      {nextActions.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">다음 액션</p>
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

// ── Project list item ─────────────────────────────────────────────────────────

function ProjectListItem({
  pp,
  isSelected,
  onSelect,
}: {
  pp: ProjectProgress;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const confirmCount = pp.confirmation_queue?.length ?? pp.needs_confirmation?.length ?? 0;
  const riskCount = pp.risks?.length ?? 0;
  const conflictCount = pp.data_conflicts?.length ?? 0;
  const staleCount = pp.stale_tasks?.length ?? 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
        isSelected
          ? "border-indigo-400 bg-indigo-50 shadow-sm"
          : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold truncate ${isSelected ? "text-indigo-900" : "text-gray-800"}`}>
          {pp.project}
        </span>
        {pp.status && <StatusBadge status={pp.status} size="xs" />}
      </div>
      {(confirmCount > 0 || riskCount > 0 || conflictCount > 0 || staleCount > 0) && (
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {confirmCount > 0 && <span className="text-orange-600 font-medium">확인 {confirmCount}</span>}
          {riskCount > 0 && <span className="text-red-600 font-medium">리스크 {riskCount}</span>}
          {conflictCount > 0 && <span className="text-orange-400">불일치 {conflictCount}</span>}
          {staleCount > 0 && <span className="text-gray-400">오래됨 {staleCount}</span>}
        </div>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  items: ProjectProgress[];
  isFallback?: boolean;
}

export function ProjectProgressView({ items, isFallback = false }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(() => defaultSelectedIndex(items));

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

  const safeIndex = Math.min(selectedIndex, items.length - 1);
  const selected = items[safeIndex];

  return (
    <Section title={`프로젝트 진행 현황 (${items.length})`}>
      {isFallback && (
        <p className="text-xs text-gray-400 mb-3">
          Agent payload의 project_progress가 없어 rawTasks 기반으로 자동 생성된 현황입니다.
        </p>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Project selector */}
        <div className="w-full lg:w-52 shrink-0">
          <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {items.map((pp, i) => (
              <div key={pp.project ?? i} className="min-w-[160px] lg:min-w-0">
                <ProjectListItem
                  pp={pp}
                  isSelected={i === safeIndex}
                  onSelect={() => setSelectedIndex(i)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        {selected && <ProjectDetail pp={selected} isFallback={isFallback} />}
      </div>
    </Section>
  );
}
