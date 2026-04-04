"use client";

import { useState, useMemo } from "react";
import type { WorkItem } from "@/lib/notion";
import type { SlackData } from "@/lib/slack";
import type { ReconciliationResult } from "@/lib/reconciliation";
import { isDone, isInProgress } from "@/lib/status";
import SlackDigest from "@/components/SlackDigest";

interface Props {
  items: WorkItem[];
  slack?: SlackData | null;
  reconciliation: ReconciliationResult[];
}

export default function BriefingView({ items, slack, reconciliation }: Props) {
  const [onTrackExpanded, setOnTrackExpanded] = useState(false);

  // Feedback persistence
  const saveFeedback = (itemId: string, vote: "up" | "down") => {
    const key = "reconciliation-feedback";
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    stored[itemId] = { vote, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(stored));
  };

  // 주의 필요: conflict items sorted by confidence
  const conflicts = useMemo(() => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    return reconciliation
      .filter((r) => r.conflict)
      .sort((a, b) => confOrder[a.confidence] - confOrder[b.confidence]);
  }, [reconciliation]);

  // 순항 중: in progress and NOT in conflict
  const conflictIds = useMemo(
    () => new Set(conflicts.map((r) => r.item.id)),
    [conflicts],
  );

  const onTrack = useMemo(
    () => items.filter((i) => isInProgress(i.status) && !conflictIds.has(i.id)),
    [items, conflictIds],
  );

  const onTrackByProject = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of onTrack) {
      const key = item.project || "미분류";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [onTrack]);

  // 이번 주 완료
  const doneItems = useMemo(
    () => items.filter((i) => isDone(i.status)),
    [items],
  );

  const doneByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of doneItems) {
      const key = item.project || "미분류";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [doneItems]);

  return (
    <div className="space-y-6">
      {/* 주의 필요 */}
      {conflicts.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <h3 className="text-sm font-semibold text-red-700">
              주의 필요 ({conflicts.length})
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {conflicts.slice(0, 5).map((r) => (
              <div
                key={r.item.id}
                className="flex items-center justify-between border-l-4 border-red-400 bg-red-50 rounded-r-lg px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <a
                    href={r.item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-red-800 hover:underline"
                  >
                    {r.item.title}
                  </a>
                  <div className="text-xs text-red-600 mt-0.5">
                    {r.item.project} · {r.item.assignee} · {r.conflictReason}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                    r.confidence === "high"
                      ? "bg-red-200 text-red-800"
                      : r.confidence === "medium"
                        ? "bg-amber-200 text-amber-800"
                        : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {r.confidence}
                </span>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button
                    onClick={(e) => { e.preventDefault(); saveFeedback(r.item.id, "up"); }}
                    className="text-xs px-1.5 py-0.5 rounded hover:bg-green-100"
                    title="정확한 감지"
                  >👍</button>
                  <button
                    onClick={(e) => { e.preventDefault(); saveFeedback(r.item.id, "down"); }}
                    className="text-xs px-1.5 py-0.5 rounded hover:bg-red-100"
                    title="오탐"
                  >👎</button>
                </div>
              </div>
            ))}
            {conflicts.length > 5 && (
              <p className="text-xs text-red-500 px-4">
                ... 외 {conflicts.length - 5}건
              </p>
            )}
          </div>
        </div>
      )}

      {/* 순항 중 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          onClick={() => setOnTrackExpanded((v) => !v)}
          className="w-full px-5 py-3 border-b bg-green-50 flex items-center justify-between text-left"
        >
          <h3 className="text-sm font-semibold text-green-700">순항 중</h3>
          <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
            {onTrack.length}건 순항 중
          </span>
        </button>
        {onTrackExpanded && (
          <div className="p-4 space-y-4">
            {Array.from(onTrackByProject.entries()).map(([project, projectItems]) => (
              <div key={project} className="border-l-2 border-green-200 pl-4">
                <h4 className="text-sm font-medium text-gray-700 mb-1">
                  {project}{" "}
                  <span className="text-xs text-gray-400">({projectItems.length})</span>
                </h4>
                <ul className="space-y-1">
                  {projectItems.map((item) => (
                    <li key={item.id} className="text-sm flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-1.5" />
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-700 hover:underline"
                      >
                        {item.title}
                      </a>
                      <span className="text-xs text-gray-400 shrink-0">{item.assignee}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 이번 주 완료 */}
      {doneItems.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-600">
              이번 주 완료 ({doneItems.length})
            </h3>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {Array.from(doneByProject.entries()).map(([project, count]) => (
                <span
                  key={project}
                  className="px-3 py-1 bg-gray-100 border rounded-full text-sm text-gray-600"
                >
                  {project} ({count}건)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 슬랙 주요 논의 */}
      {slack && slack.messages.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-indigo-50">
            <h3 className="text-sm font-semibold text-indigo-700">
              슬랙 주요 논의 ({slack.messages.length})
            </h3>
          </div>
          <div className="p-5">
            <SlackDigest msgs={slack.messages} />
          </div>
        </div>
      )}
    </div>
  );
}
