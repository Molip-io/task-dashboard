"use client";

import { Component, type ReactNode, useState } from "react";
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
  ActionType,
} from "@/lib/types";
import type { DashboardTask } from "@/lib/notion-tasks";
import {
  buildProjectProgressViewModel,
  countTasksForProject,
  safeArray,
  type ProjectFallbackMode,
  type ProjectProgressViewModel,
} from "@/lib/project-progress-view-model";
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

const STATUS_LABELS_KO: Record<string, string> = {
  normal: "정상", watch: "관찰", risk: "주의", blocked: "막힘",
};

const WS_STATUS_CLS: Record<string, string> = {
  "진행 중":    "bg-blue-100 text-blue-700",
  "완료":       "bg-green-100 text-green-700",
  "지연":       "bg-red-100 text-red-700",
  "임박":       "bg-orange-100 text-orange-700",
  "예정":       "bg-gray-100 text-gray-600",
  "QA":         "bg-purple-100 text-purple-700",
  "업로드대기": "bg-yellow-100 text-yellow-700",
  "리뷰":       "bg-indigo-100 text-indigo-700",
  "결정 필요":  "bg-pink-100 text-pink-700",
  "착수 전":    "bg-gray-100 text-gray-500",
};

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  Decide:  "결정",
  Ask:     "확인",
  Align:   "정렬",
  Unblock: "병목 해소",
  Watch:   "관찰",
  Ignore:  "무시",
};

const ACTION_TYPE_CLS_WS: Record<string, string> = {
  Decide:  "bg-red-50 text-red-600 border-red-200",
  Ask:     "bg-orange-50 text-orange-600 border-orange-200",
  Align:   "bg-blue-50 text-blue-600 border-blue-200",
  Unblock: "bg-purple-50 text-purple-700 border-purple-200",
  Watch:   "bg-gray-50 text-gray-500 border-gray-200",
  Ignore:  "bg-gray-50 text-gray-400 border-gray-100",
};

const INVALID_OWNERS = new Set([
  "확인 필요 담당자", "담당자 확인 필요", "담당자 미정",
  "unknown owner", "미기록 담당자", "미기록",
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
  return placeholders.reduce((acc, v, i) => acc.replace(`__VER_${i}__`, v), broken);
}

const STATUS_ORDER: Record<string, number> = { blocked: 0, risk: 1, watch: 2, normal: 3 };

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

/** 드롭다운 옵션 문자열 — "#1 포지 앤 포춘 · 위험 · 96점 · 확인 2" */
function projectOptionLabel(pp: ProjectProgress): string {
  const rank = pp.priority_rank !== undefined ? `#${pp.priority_rank} ` : "";
  const statusKo = pp.status ? ` · ${STATUS_LABELS_KO[pp.status] ?? pp.status}` : "";
  const score = pp.priority_score !== undefined ? ` · ${pp.priority_score}점` : "";
  const confirmCount =
    (Array.isArray(pp.confirmation_queue) ? pp.confirmation_queue.length : 0) +
    (Array.isArray(pp.needs_confirmation) ? pp.needs_confirmation.length : 0);
  const riskCount = Array.isArray(pp.risks) ? pp.risks.length : 0;
  const countParts = [
    confirmCount > 0 ? `확인 ${confirmCount}` : "",
    riskCount > 0 ? `리스크 ${riskCount}` : "",
  ].filter(Boolean).join(" · ");
  return `${rank}${pp.project}${statusKo}${score}${countParts ? ` · ${countParts}` : ""}`;
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

function ActionTypeBadge({ type }: { type: ActionType | string }) {
  const label = ACTION_TYPE_LABELS[type as ActionType] ?? type;
  const cls = ACTION_TYPE_CLS_WS[type] ?? ACTION_TYPE_CLS_WS.Watch;
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-medium px-2 py-0.5 border ${cls}`}>
      {label}
    </span>
  );
}

// ── Data Health (collapsible) ─────────────────────────────────────────────────

function DataHealthBadge({ health }: { health: ProjectDataHealth }) {
  const score = health.confidence_score;
  const status = health.status;
  const notes = safeArray<string>(health.notes);
  const cls =
    status === "high" ? "text-green-600" :
    status === "medium" ? "text-yellow-600" : "text-red-600";
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
        {notes.map((n, i) => (
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
      ? (ws.evidence as EvidenceSummary) : null;
  const notionCount = evObj?.notion_count ?? ws.evidence_summary?.notion_count ?? 0;
  const slackCount  = evObj?.slack_count  ?? ws.evidence_summary?.slack_count  ?? 0;
  const confidence  = evObj?.confidence   ?? ws.evidence_summary?.confidence;

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
          <p>{evObj?.combined_summary ?? ws.evidence_summary?.combined_summary}</p>
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
    (t) => t.summary || (t.owners?.length ?? 0) > 0 || (t.status && t.status !== "unknown")
  );
  if (!visible.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-semibold text-gray-400">트랙별</p>
      {visible.map((t, i) => {
        const validOwners = (t.owners ?? []).filter(isValidOwner);
        const meta = [
          t.summary,
          validOwners.length ? `담당: ${validOwners.join(", ")}` : "",
        ].filter(Boolean).join(" · ");
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
    <div className="mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-1">기능별</p>
      <div className="space-y-1.5">
        {functions.map((f, i) => {
          const validOwners = (f.owners ?? []).filter(isValidOwner);
          return (
            <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-x-2 text-xs">
              <div>
                <span className="font-medium text-gray-800">{f.function}</span>
                {f.track && (
                  <span className="text-gray-400 ml-1">
                    [{TRACK_LABELS[f.track] ?? f.track}]
                  </span>
                )}
                {validOwners.length > 0 && (
                  <span className="text-indigo-600 ml-1">
                    · {validOwners.join(", ")}
                  </span>
                )}
                {f.summary && (
                  <p className="text-gray-500 mt-0.5 leading-snug">{f.summary}</p>
                )}
                {f.next_action && (
                  <p className="text-indigo-700 mt-0.5">→ {f.next_action}</p>
                )}
              </div>
              {f.status && <WsStatusBadge status={f.status} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OwnerBreakdownSection({
  owners,
  functionBreakdown,
}: {
  owners: OwnerBreakdownItem[];
  functionBreakdown?: FunctionBreakdownItem[];
}) {
  let displayOwners = owners.filter((o) => isValidOwner(o.owner));

  // function_breakdown에서 owner 유추 (owner_breakdown이 없을 때)
  if (!displayOwners.length && functionBreakdown?.length) {
    const ownerMap = new Map<string, string[]>();
    for (const f of functionBreakdown) {
      for (const owner of (f.owners ?? [])) {
        if (isValidOwner(owner)) {
          if (!ownerMap.has(owner)) ownerMap.set(owner, []);
          ownerMap.get(owner)!.push(f.function);
        }
      }
    }
    displayOwners = Array.from(ownerMap.entries()).map(([owner, funcs]) => ({
      owner,
      summary: `기능: ${funcs.join(", ")}`,
    }));
  }

  if (!displayOwners.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-1">작업자별</p>
      <ul className="space-y-1.5">
        {displayOwners.map((o, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs">
            <span className="shrink-0 text-gray-400">👤</span>
            <div>
              {(() => {
                const tasks = safeArray<string>(o.tasks);
                const questions = safeArray<{
                  function?: string | null;
                  track?: string;
                  workstream?: string;
                  question: string;
                }>(o.questions);

                return (
                  <>
                    <span className="font-medium text-gray-800">{o.owner}</span>
                    {o.status && (
                      <span className="text-gray-400 ml-1">({o.status})</span>
                    )}
                    {o.summary && (
                      <p className="text-gray-500 mt-0.5 leading-snug">{o.summary}</p>
                    )}
                    {tasks.length > 0 && (
                      <p className="text-gray-400 mt-0.5">
                        {tasks.slice(0, 2).join(", ")}
                        {tasks.length > 2 ? ` +${tasks.length - 2}` : ""}
                      </p>
                    )}
                    {questions.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5">
                        {questions.map((q, qi) => (
                          <li key={qi} className="text-amber-700">
                            {q.function ?? q.track ?? q.workstream
                              ? `[${q.function ?? q.track ?? q.workstream}] `
                              : ""}
                            {q.question}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InlineSlackSignals({ signals }: { signals: SlackSignal[] }) {
  if (!signals.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-semibold text-gray-400">Slack 신호</p>
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

// ── Workstream card (collapsible details) ──────────────────────────────────────

function WorkstreamCard({ ws }: { ws: Workstream }) {
  const w = ws as unknown as Record<string, unknown>;
  const label = (
    ws.label || (w.name as string) || (w.title as string) || "미분류"
  ).trim();

  const combinedSummary =
    ws.display_summary ??
    ws.combined_summary ??
    ws.evidence_summary?.combined_summary ??
    (w.summary as string) ??
    (typeof ws.evidence === "string" ? ws.evidence : undefined) ??
    "";
  const nextAction = ws.next_action ?? (w.nextAction as string) ?? "";
  const items = safeArray<string>(ws.items ?? (w.key_tasks as string[]) ?? (w.tasks as string[]));

  const tracks        = Array.isArray(ws.track_breakdown)    ? ws.track_breakdown    : [];
  const functions     = Array.isArray(ws.function_breakdown) ? ws.function_breakdown : [];
  const ownerBreakdown = Array.isArray(ws.owner_breakdown)   ? ws.owner_breakdown    : [];
  const inlineSignals = Array.isArray(ws.slack_signals)      ? ws.slack_signals      : [];
  const wsRisks       = Array.isArray(ws.risks)              ? ws.risks              : [];
  const actionType    = ws.action_type as ActionType | undefined;

  const hasDetails =
    functions.length > 0 || ownerBreakdown.length > 0 ||
    tracks.length > 0 || inlineSignals.length > 0 || wsRisks.length > 0;

  const detailSections = [
    functions.length > 0    ? "기능별" : "",
    ownerBreakdown.length > 0 || functions.some((f) => (f.owners?.length ?? 0) > 0)
      ? "작업자별" : "",
    tracks.length > 0       ? "트랙별" : "",
    wsRisks.length > 0      ? "리스크" : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="border-l-2 border-gray-200 pl-3 py-1">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <WsStatusBadge status={ws.status} />
        {actionType && <ActionTypeBadge type={actionType} />}
      </div>

      {/* Summary */}
      {combinedSummary && (
        <div className="text-sm text-gray-700 whitespace-pre-line leading-snug">
          {formatSummaryText(combinedSummary)}
        </div>
      )}

      {/* Items fallback (summary 없을 때) */}
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

      {/* Evidence badge (collapsible) */}
      <EvidenceBadge ws={ws} />

      {/* Next action */}
      {nextAction && (
        <p className="mt-1.5 text-xs text-indigo-700 font-medium flex gap-1">
          <span className="shrink-0">→</span>
          <span>{nextAction}</span>
        </p>
      )}

      {/* Detailed breakdown — 접힘 */}
      {hasDetails && (
        <details className="mt-2">
          <summary className="text-xs cursor-pointer select-none text-gray-400 hover:text-gray-600 list-none inline-flex items-center gap-1">
            <span>▸</span>
            <span>상세 보기</span>
            {detailSections && (
              <span className="text-gray-300">({detailSections})</span>
            )}
          </summary>
          <div className="mt-2 pl-1 space-y-3 border-t border-gray-100 pt-2">
            {functions.length > 0 && (
              <FunctionBreakdownSection functions={functions} />
            )}
            {(ownerBreakdown.length > 0 || functions.some((f) => (f.owners?.length ?? 0) > 0)) && (
              <OwnerBreakdownSection
                owners={ownerBreakdown}
                functionBreakdown={functions}
              />
            )}
            {tracks.length > 0 && (
              <TrackBreakdownSection tracks={tracks} />
            )}
            {inlineSignals.length > 0 && (
              <InlineSlackSignals signals={inlineSignals} />
            )}
            {wsRisks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 mb-1">리스크</p>
                <ul className="space-y-0.5">
                  {wsRisks.map((r, i) => (
                    <li key={i} className="flex items-start gap-1 text-xs text-red-700">
                      <span className="shrink-0">⚠</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ── CEO Actions / confirmation queue ─────────────────────────────────────────

function CeoActionsSection({ pp }: { pp: ProjectProgress }) {
  const ceoActions = pp.ceo_actions;
  const confirmQueue = Array.isArray(pp.confirmation_queue) ? pp.confirmation_queue : [];

  const todayItems = Array.isArray(ceoActions?.today)
    ? ceoActions!.today
    : confirmQueue.filter((c) => c.timing === "today").map((c) => c.item);
  const weekItems = Array.isArray(ceoActions?.this_week)
    ? ceoActions!.this_week
    : confirmQueue.filter((c) => c.timing === "this_week").map((c) => c.item);
  const watchItems = Array.isArray(ceoActions?.watch)
    ? ceoActions!.watch
    : confirmQueue.filter((c) => c.timing === "watch").map((c) => c.item);

  const hasQueueData = todayItems.length > 0 || weekItems.length > 0 || watchItems.length > 0;
  const legacyItems: ConfirmationNeeded[] = !hasQueueData ? (pp.needs_confirmation ?? []) : [];
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
                <span className="text-red-400 shrink-0">•</span><span>{item}</span>
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
                <span className="text-orange-400 shrink-0">•</span><span>{item}</span>
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
                <span className="text-gray-300 shrink-0">•</span><span>{item}</span>
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
      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1">
        데이터 불일치 ({conflicts.length})
      </p>
      <div className="space-y-2">
        {conflicts.map((c, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 border text-xs ${
              c.severity === "high" ? "bg-red-50 border-red-200" :
              c.severity === "medium" ? "bg-orange-50 border-orange-200" :
              "bg-yellow-50 border-yellow-200"
            }`}
          >
            {c.interpretation && (
              <p className="font-semibold text-gray-700 mb-0.5">{c.interpretation}</p>
            )}
            {(c.summary ?? c.description) && (
              <p className="text-gray-600">{c.summary ?? c.description}</p>
            )}
            {c.recommended_action && (
              <p className="mt-1 text-indigo-600 font-medium">→ {c.recommended_action}</p>
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
                <span className="text-gray-400"> · 최근 수정 {t.days_since_update}일 전</span>
              )}
              {t.status && (
                <span className="text-gray-400">, {t.status} 상태 유지</span>
              )}
              {t.recommended_action && (
                <span className="text-indigo-600 ml-1">→ {t.recommended_action}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Project detail tabs / boundary ───────────────────────────────────────────

type DetailTabId = "functions" | "owners" | "sprints" | "workstreams" | "risks";

const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: "functions", label: "기능 현황" },
  { id: "owners", label: "담당자" },
  { id: "sprints", label: "스프린트" },
  { id: "workstreams", label: "Workstream" },
  { id: "risks", label: "근거/리스크" },
];

function EmptyTabState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
      {message}
    </div>
  );
}

function SprintStatusSection({ items }: { items: import("@/lib/types").SprintStatusItem[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.sprint}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{item.sprint}</span>
            {item.status && <WsStatusBadge status={item.status} />}
          </div>
          {item.summary && (
            <p className="mt-1 text-sm text-gray-600 leading-snug">{item.summary}</p>
          )}
          {safeArray<string>(item.owners).length > 0 && (
            <p className="mt-1 text-xs text-indigo-700">
              담당: {safeArray<string>(item.owners).join(", ")}
            </p>
          )}
          {safeArray<string>(item.items).length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {safeArray<string>(item.items).slice(0, 4).map((task, taskIndex) => (
                <li key={taskIndex} className="text-xs text-gray-500">
                  - {task}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function FallbackContextSection({ vm }: { vm: ProjectProgressViewModel }) {
  if (vm.fallbackMode === "agent" && !vm.parseErrorMessage) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="text-xs font-semibold text-amber-800">
        {vm.fallbackNotice ?? "프로젝트 상세는 방어적으로 렌더링됩니다."}
      </p>
      <div className="mt-1 space-y-0.5 text-xs text-amber-700">
        {vm.parseErrorRunId && <p>run: {vm.parseErrorRunId}</p>}
        {vm.parseErrorMessage && <p>parse: {vm.parseErrorMessage}</p>}
        {vm.rawTaskCount > 0 && <p>rawTasks: {vm.rawTaskCount}건</p>}
      </div>
    </div>
  );
}

interface ProjectDetailBoundaryProps {
  projectName: string;
  payloadStatus: ProjectFallbackMode;
  parseErrorRunId?: string;
  children: ReactNode;
}

interface ProjectDetailBoundaryState {
  hasError: boolean;
  message?: string;
}

class ProjectDetailErrorBoundary extends Component<
  ProjectDetailBoundaryProps,
  ProjectDetailBoundaryState
> {
  override state: ProjectDetailBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ProjectDetailBoundaryState {
    return {
      hasError: true,
      message: error.message,
    };
  }

  override componentDidCatch(error: Error) {
    console.error("[ProjectDetailErrorBoundary]", error);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    const showDevMessage = process.env.NODE_ENV !== "production";

    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm">
        <p className="font-semibold text-red-800">
          프로젝트 상세를 불러오지 못했습니다. 데이터 형식이 예상과 다를 수 있습니다.
        </p>
        <div className="mt-2 space-y-1 text-xs text-red-700">
          <p>project: {this.props.projectName}</p>
          <p>payload status: {this.props.payloadStatus}</p>
          {this.props.parseErrorRunId && <p>run: {this.props.parseErrorRunId}</p>}
          {showDevMessage && this.state.message && <p>error: {this.state.message}</p>}
        </div>
      </div>
    );
  }
}

function ProjectDetailBody({ vm }: { vm: ProjectProgressViewModel }) {
  const [activeTab, setActiveTab] = useState<DetailTabId>("functions");
  const hasFunctionData = vm.function_status.length > 0;
  const hasOwnerData = vm.owner_status.length > 0;
  const hasSprintData = vm.sprint_status.length > 0;
  const hasWorkstreamData = vm.workstreams.length > 0;
  const hasRiskData =
    vm.risks.length > 0 ||
    vm.data_conflicts.length > 0 ||
    vm.stale_tasks.length > 0 ||
    vm.parseErrorMessage !== undefined ||
    vm.rawTaskCount > 0;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium ${
              activeTab === tab.id
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {activeTab === "functions" && (
          hasFunctionData ? (
            <FunctionBreakdownSection functions={vm.function_status} />
          ) : (
            <EmptyTabState message="기능 현황 데이터가 없어도 프로젝트 상세는 계속 볼 수 있습니다." />
          )
        )}

        {activeTab === "owners" && (
          hasOwnerData ? (
            <OwnerBreakdownSection owners={vm.owner_status} functionBreakdown={vm.function_status} />
          ) : (
            <EmptyTabState message="담당자 정보가 아직 정리되지 않았습니다." />
          )
        )}

        {activeTab === "sprints" && (
          hasSprintData ? (
            <SprintStatusSection items={vm.sprint_status} />
          ) : (
            <EmptyTabState message="스프린트 정보가 없거나 task 제목에서 패턴을 찾지 못했습니다." />
          )
        )}

        {activeTab === "workstreams" && (
          hasWorkstreamData ? (
            <div className="space-y-3">
              {vm.workstreams.map((ws, index) => (
                <WorkstreamCard key={`${ws.label}-${index}`} ws={ws} />
              ))}
            </div>
          ) : (
            <EmptyTabState message="Workstream 데이터가 없어 빈 상태로 표시합니다." />
          )
        )}

        {activeTab === "risks" && (
          <div className="space-y-3">
            <FallbackContextSection vm={vm} />
            <DataConflictsSection conflicts={vm.data_conflicts} />
            <StaleTasksSection tasks={vm.stale_tasks} />
            {vm.risks.length > 0 ? (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-3">
                <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">리스크</p>
                <ul className="space-y-0.5">
                  {vm.risks.map((risk, index) => (
                    <li key={index} className="flex items-start gap-1.5 text-sm text-red-700">
                      <span className="shrink-0">⚠</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!hasRiskData && (
              <EmptyTabState message="근거/리스크 데이터가 없어도 상세 보기는 유지됩니다." />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Project detail panel ──────────────────────────────────────────────────────

function ProjectDetail({
  vm,
  isFallback,
}: {
  vm: ProjectProgressViewModel;
  isFallback: boolean;
}) {
  const displaySummary = vm.display_summary ?? vm.current_summary ?? "";

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2 mb-1 flex-wrap">
        {vm.priority_rank !== undefined && (
          <span className="text-xs font-bold text-gray-400 mt-1">#{vm.priority_rank}</span>
        )}
        <h3 className="font-bold text-gray-900 text-base leading-snug">{vm.project}</h3>
        {vm.status && <StatusBadge status={vm.status} size="xs" />}
        {isFallback && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            자동 생성
          </span>
        )}
        {vm.priority_score !== undefined && (
          <span className="text-xs text-gray-400 mt-1">{vm.priority_score}점</span>
        )}
        {vm.confidence_score !== undefined && (
          <span className="text-xs text-gray-400 mt-1">신뢰도 {vm.confidence_score}</span>
        )}
      </div>

      {vm.priority_reason && (
        <p className="text-xs text-gray-500 mb-1 leading-snug">{vm.priority_reason}</p>
      )}
      {displaySummary && (
        <div className="text-sm text-gray-600 mb-2 leading-snug whitespace-pre-line">
          {formatSummaryText(displaySummary)}
        </div>
      )}

      {/* Data Health */}
      <DataHealthBadge health={vm.project_data_health} />

      {/* CEO Actions */}
      <CeoActionsSection pp={vm as unknown as ProjectProgress} />

      {/* Schedule notes */}
      {vm.schedule_notes && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">일정 메모</p>
          <p className="mt-0.5 text-sm text-gray-700 whitespace-pre-line">{vm.schedule_notes}</p>
        </div>
      )}

      <ProjectDetailErrorBoundary
        projectName={vm.project}
        payloadStatus={vm.fallbackMode}
        parseErrorRunId={vm.parseErrorRunId}
      >
        <ProjectDetailBody vm={vm} />
      </ProjectDetailErrorBoundary>

      {/* Next actions */}
      {vm.next_actions.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">다음 액션</p>
          <ul className="space-y-0.5">
            {vm.next_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-indigo-700">
                <span className="shrink-0">→</span><span>{a}</span>
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
  fallbackMode?: ProjectFallbackMode;
  parseErrorRunId?: string;
  parseErrorMessage?: string;
  rawTasks?: DashboardTask[];
}

export function ProjectProgressView({
  items,
  isFallback = false,
  fallbackMode = isFallback ? "missing_project_progress" : "agent",
  parseErrorRunId,
  parseErrorMessage,
  rawTasks = [],
}: Props) {
  const safeItems = safeArray<ProjectProgress>(items);
  const sorted = sortProjectsByPriority(safeItems);
  const [selectedIndex, setSelectedIndex] = useState(() => defaultSelectedIndex(sorted));

  if (!safeItems.length) {
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
  const selectedVm = selected
    ? buildProjectProgressViewModel(selected, {
        isFallback,
        fallbackMode,
        parseErrorRunId,
        parseErrorMessage,
        rawTaskCount: countTasksForProject(rawTasks, selected.project),
      })
    : null;

  return (
    <Section title={`프로젝트 진행 판단 (${sorted.length})`}>
      {isFallback && (
        <p className="text-xs text-gray-400 mb-3">
          {fallbackMode === "invalid_payload"
            ? "Agent payload 파싱 실패로 원본 작업 기반 상세를 표시합니다."
            : fallbackMode === "raw_tasks_only"
            ? "판단 payload 없이 rawTasks 기반 상세를 표시합니다."
            : "Agent payload의 project_progress가 없어 rawTasks 기반으로 자동 생성된 현황입니다."}
        </p>
      )}

      {/* 프로젝트 드롭다운 */}
      <div className="mb-4">
        <select
          value={safeIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
        >
          {sorted.map((pp, i) => (
            <option key={pp.project ?? i} value={i}>
              {projectOptionLabel(pp)}
            </option>
          ))}
        </select>
      </div>

      {/* 선택 프로젝트 상세 */}
      {selectedVm && <ProjectDetail vm={selectedVm} isFallback={isFallback} />}
    </Section>
  );
}
