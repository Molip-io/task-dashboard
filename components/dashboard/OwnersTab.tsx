"use client";

import type { OwnerStatus, ConfirmationQueueItem } from "@/lib/types";
import type { DashboardTask } from "@/lib/notion-tasks";
import { OwnerStatusCard } from "./OwnerStatusCard";
import { UnassignedItemsPanel } from "./UnassignedItemsPanel";

// ── 상수 ──────────────────────────────────────────────────────────────────────

const INVALID_OWNERS = new Set([
  "확인 필요 담당자", "담당자 확인 필요", "담당자 미정",
  "unknown owner", "미기록 담당자", "미기록",
]);

const STATUS_ORDER: Record<string, number> = {
  blocked: 0,
  risk:    1,
  watch:   2,
  normal:  3,
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OwnersTabProps {
  /** buildOwners() 결과 — rawTasks 기반 + agent 오버레이 */
  taskOwners: OwnerStatus[];
  confirmationQueue: ConfirmationQueueItem[];
  rawTasks: DashboardTask[];
}

// ── OwnersTab ─────────────────────────────────────────────────────────────────

export function OwnersTab({
  taskOwners,
  confirmationQueue,
  rawTasks,
}: OwnersTabProps) {
  // ── rawTasks → 담당자별 프로젝트 목록 + 임박 작업 수 ──────────────────────
  const ownerProjects = new Map<string, Set<string>>();
  const ownerDueSoon  = new Map<string, number>();

  for (const t of rawTasks) {
    const owners = t.owners.length ? t.owners : [t.owner];
    for (const o of owners) {
      const name = o?.trim();
      if (!name || INVALID_OWNERS.has(name)) continue;

      if (!ownerProjects.has(name)) ownerProjects.set(name, new Set());
      ownerProjects.get(name)!.add(t.project);

      if (t.is_due_soon) {
        ownerDueSoon.set(name, (ownerDueSoon.get(name) ?? 0) + 1);
      }
    }
  }

  // ── confirmation_queue → 담당자별 질문 맵 ─────────────────────────────────
  const questionsByOwner = new Map<string, ConfirmationQueueItem[]>();

  for (const q of Array.isArray(confirmationQueue) ? confirmationQueue : []) {
    const name = q.owner?.trim();
    if (!name || INVALID_OWNERS.has(name) || q.owner_status === "unassigned") continue;
    if (!questionsByOwner.has(name)) questionsByOwner.set(name, []);
    questionsByOwner.get(name)!.push(q);
  }

  // ── 정렬 ──────────────────────────────────────────────────────────────────
  const sorted = [...(Array.isArray(taskOwners) ? taskOwners : [])].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 3;
    const sb = STATUS_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;

    const ta = a.metrics?.["전체"] ?? 0;
    const tb = b.metrics?.["전체"] ?? 0;
    if (ta !== tb) return tb - ta;

    return a.owner.localeCompare(b.owner, "ko");
  });

  return (
    <div className="space-y-6">
      {/* 1. 담당자 미지정 항목 패널 */}
      <UnassignedItemsPanel items={confirmationQueue} />

      {/* 2. 안내 문구 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          전체 담당자 ({sorted.length})
        </h2>
        <p className="text-xs text-gray-400">
          현재는 작업이 배정된 담당자 기준
        </p>
      </div>

      {/* 3. 담당자 카드 그리드 */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">👤</p>
          <p className="text-sm">작업이 배정된 담당자가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((o) => (
            <OwnerStatusCard
              key={o.owner}
              owner={o}
              projects={Array.from(ownerProjects.get(o.owner) ?? [])}
              dueSoon={ownerDueSoon.get(o.owner) ?? 0}
              questions={questionsByOwner.get(o.owner) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
