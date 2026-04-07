"use client";

import { useState, useMemo } from "react";
import type { WorkItem } from "@/lib/notion";
import type { SlackData } from "@/lib/slack";
import type { ReconciliationResult } from "@/lib/reconciliation";
import { matchChannelToProject } from "@/lib/reconciliation";
import type { Alert } from "@/lib/bottlenecks";
import { isDone, isInProgress } from "@/lib/status";
import SlackDigest from "@/components/SlackDigest";

interface Props {
  items: WorkItem[];
  reconciliation?: ReconciliationResult[];
  slack?: SlackData | null;
  alerts?: Alert[];
}

interface ProjectSummary {
  name: string;
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  sprints: string[];
  assignees: string[];
  items: WorkItem[];
}

export default function ProjectView({ items, reconciliation, slack, alerts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Count conflicts per project
  const conflictsByProject = useMemo(() => {
    if (!reconciliation) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const r of reconciliation) {
      if (r.conflict) {
        const project = r.item.project || "미분류";
        map.set(project, (map.get(project) || 0) + 1);
      }
    }
    return map;
  }, [reconciliation]);

  // Count alerts per project for status lights
  const alertsByProject = useMemo(() => {
    if (!alerts) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const a of alerts) {
      const project = a.item.project || "미분류";
      map.set(project, (map.get(project) || 0) + 1);
    }
    return map;
  }, [alerts]);

  // Group slack messages by project
  const slackByProject = useMemo(() => {
    type MsgArray = SlackData["messages"];
    if (!slack || slack.messages.length === 0) return new Map<string, MsgArray>();
    const projectNames = [...new Set(items.map((i) => i.project).filter(Boolean))];
    const map = new Map<string, MsgArray>();
    for (const msg of slack.messages) {
      const project = matchChannelToProject(msg.channelName, projectNames);
      if (project) {
        const arr = map.get(project) || [];
        arr.push(msg);
        map.set(project, arr);
      }
    }
    return map;
  }, [slack, items]);

  const projects = useMemo((): ProjectSummary[] => {
    const map = new Map<string, WorkItem[]>();
    for (const item of items) {
      const key = item.project || "미분류";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries())
      .map(([name, projectItems]) => {
        const done = projectItems.filter((i) => isDone(i.status)).length;
        const inProgress = projectItems.filter((i) => isInProgress(i.status)).length;
        const sprints = [...new Set(projectItems.map((i) => i.sprint).filter(Boolean))].sort();
        const assignees = [...new Set(projectItems.map((i) => i.assignee).filter((a) => a && a !== "미지정"))].sort();

        return {
          name,
          total: projectItems.length,
          done,
          inProgress,
          todo: projectItems.length - done - inProgress,
          sprints,
          assignees,
          items: projectItems,
        };
      })
      .sort((a, b) => b.inProgress - a.inProgress || b.total - a.total);
  }, [items]);

  const toggleExpand = (name: string) => {
    setExpanded(expanded === name ? null : name);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((p) => (
          <div
            key={p.name}
            className={`rounded-xl border bg-white shadow-sm cursor-pointer transition-all hover:shadow-md ${
              expanded === p.name ? "ring-2 ring-blue-500 col-span-full" : ""
            }`}
            onClick={() => toggleExpand(p.name)}
          >
            {/* Card Header */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {/* Status light: 🔴 alerts≥3, 🟡 alerts≥1, 🟢 0 */}
                  {(() => {
                    const ac = alertsByProject.get(p.name) ?? 0;
                    if (ac >= 3) return <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" title={`병목 ${ac}건`} />;
                    if (ac >= 1) return <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title={`병목 ${ac}건`} />;
                    return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="병목 없음" />;
                  })()}
                  <h3 className="text-base font-semibold text-gray-900">{p.name}</h3>
                  {(conflictsByProject.get(p.name) ?? 0) > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      주의 {conflictsByProject.get(p.name)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{p.total}건</span>
              </div>

              {/* Progress Bar */}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className="h-full flex">
                  <div
                    className="bg-gray-400 transition-all"
                    style={{ width: `${(p.done / p.total) * 100}%` }}
                  />
                  <div
                    className="bg-blue-500 transition-all"
                    style={{ width: `${(p.inProgress / p.total) * 100}%` }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4 text-xs">
                <span className="text-blue-600 font-medium">진행중 {p.inProgress}</span>
                <span className="text-gray-500">완료 {p.done}</span>
                <span className="text-yellow-600">대기 {p.todo}</span>
              </div>

              {/* Sprint Tags */}
              {p.sprints.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {p.sprints.slice(0, 5).map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">
                      {s}
                    </span>
                  ))}
                  {p.sprints.length > 5 && (
                    <span className="text-xs text-gray-400">+{p.sprints.length - 5}</span>
                  )}
                </div>
              )}
            </div>

            {/* Expanded Detail */}
            {expanded === p.name && (
              <div className="border-t px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()}>
                {/* Assignees */}
                <div className="mb-3">
                  <span className="text-xs font-medium text-gray-500">담당자: </span>
                  <span className="text-xs text-gray-700">
                    {p.assignees.slice(0, 8).join(", ")}
                    {p.assignees.length > 8 && ` 외 ${p.assignees.length - 8}명`}
                  </span>
                </div>

                {/* In-progress items */}
                {p.inProgress > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-blue-700 mb-1">진행중 ({p.inProgress})</h4>
                    <ul className="space-y-1">
                      {p.items
                        .filter((i) => isInProgress(i.status))
                        .map((item) => (
                          <li key={item.id} className="text-sm flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                              {item.title}
                            </a>
                            <span className="text-xs text-gray-400 shrink-0">{item.assignee}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {/* Todo items */}
                {p.todo > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-yellow-700 mb-1">대기 ({p.todo})</h4>
                    <ul className="space-y-1">
                      {p.items
                        .filter((i) => !isDone(i.status) && !isInProgress(i.status))
                        .slice(0, 10)
                        .map((item) => (
                          <li key={item.id} className="text-sm flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                            <span className="truncate text-gray-700">{item.title}</span>
                            <span className="text-xs text-gray-400 shrink-0">{item.assignee}</span>
                          </li>
                        ))}
                      {p.todo > 10 && (
                        <li className="text-xs text-gray-400 pl-4">... 외 {p.todo - 10}건</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Mini Slack digest */}
                {(slackByProject.get(p.name)?.length ?? 0) > 0 && (
                  <SlackDigest msgs={slackByProject.get(p.name)!.slice(0, 3)} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
