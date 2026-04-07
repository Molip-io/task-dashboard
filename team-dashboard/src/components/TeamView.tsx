"use client";

import { useState, useMemo } from "react";
import type { WorkItem } from "@/lib/notion";
import type { Alert } from "@/lib/bottlenecks";
import { isDone, isInProgress, formatShortDate } from "@/lib/status";

interface Props {
  items: WorkItem[];
  alerts: Alert[];
}

interface TeamMember {
  name: string;
  inProgress: number;
  todo: number;
  done: number;
  alertCount: number;
  items: WorkItem[];
}

interface TeamSummary {
  team: string;
  total: number;
  inProgress: number;
  todo: number;
  done: number;
  alertCount: number;
  members: TeamMember[];
}

export default function TeamView({ items, alerts }: Props) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const alertsByAssignee = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of alerts) {
      const name = a.item.assignee;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return map;
  }, [alerts]);

  const alertsByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of alerts) {
      const team = a.item.team || "미분류";
      map.set(team, (map.get(team) || 0) + 1);
    }
    return map;
  }, [alerts]);

  const teams = useMemo((): TeamSummary[] => {
    const byTeam = new Map<string, Map<string, WorkItem[]>>();
    for (const item of items) {
      const team = item.team || "미분류";
      const assignee = item.assignee || "미지정";
      if (!byTeam.has(team)) byTeam.set(team, new Map());
      const members = byTeam.get(team)!;
      if (!members.has(assignee)) members.set(assignee, []);
      members.get(assignee)!.push(item);
    }

    return Array.from(byTeam.entries())
      .map(([team, membersMap]) => {
        const members = Array.from(membersMap.entries())
          .filter(([name]) => name !== "미지정")
          .map(([name, memberItems]): TeamMember => ({
            name,
            inProgress: memberItems.filter((i) => isInProgress(i.status)).length,
            todo: memberItems.filter((i) => !isDone(i.status) && !isInProgress(i.status)).length,
            done: memberItems.filter((i) => isDone(i.status)).length,
            alertCount: alertsByAssignee.get(name) || 0,
            items: memberItems,
          }))
          .sort((a, b) => b.inProgress - a.inProgress);

        const total = members.reduce((s, m) => s + m.inProgress + m.todo + m.done, 0);
        const inProgress = members.reduce((s, m) => s + m.inProgress, 0);
        const done = members.reduce((s, m) => s + m.done, 0);
        const todo = members.reduce((s, m) => s + m.todo, 0);

        return {
          team,
          total,
          inProgress,
          todo,
          done,
          alertCount: alertsByTeam.get(team) || 0,
          members,
        };
      })
      .sort((a, b) => b.inProgress - a.inProgress || b.total - a.total);
  }, [items, alertsByAssignee, alertsByTeam]);

  return (
    <div className="space-y-4">
      {teams.map((t) => {
        const isExpanded = expandedTeam === t.team;
        const donePct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;

        return (
          <div key={t.team} className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* Team Header */}
            <button
              onClick={() => setExpandedTeam(isExpanded ? null : t.team)}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-gray-900">{t.team}</h3>
                <span className="text-xs text-gray-400">{t.members.length}명</span>
                {t.alertCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                    병목 {t.alertCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-3 text-xs">
                  <span className="text-blue-600 font-medium">진행 {t.inProgress}</span>
                  <span className="text-yellow-600">대기 {t.todo}</span>
                  <span className="text-gray-400">완료 {t.done}</span>
                </div>
                <span className="text-xs text-gray-400">{isExpanded ? "▼" : "▶"}</span>
              </div>
            </button>

            {/* Progress Bar */}
            <div className="px-5 pb-3">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full flex">
                  <div className="bg-gray-400 transition-all" style={{ width: `${donePct}%` }} />
                  <div
                    className="bg-blue-500 transition-all"
                    style={{ width: `${t.total > 0 ? Math.round((t.inProgress / t.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>완료율 {donePct}%</span>
                <span>총 {t.total}건</span>
              </div>
            </div>

            {/* Expanded: Member List */}
            {isExpanded && (
              <div className="border-t px-5 py-4 space-y-3">
                {t.members.map((member) => (
                  <MemberCard key={member.name} member={member} team={t.team} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberCard({ member, team }: { member: TeamMember; team: string }) {
  const [expanded, setExpanded] = useState(false);
  const overloaded = member.inProgress >= 5;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full text-left p-3 rounded-lg border transition-colors ${
          overloaded ? "border-red-200 bg-red-50" : "border-gray-100 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{member.name}</span>
            {member.alertCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                {member.alertCount}
              </span>
            )}
            {overloaded && <span className="text-xs text-red-600">과부하</span>}
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-blue-600">진행 {member.inProgress}</span>
            <span className="text-yellow-600">대기 {member.todo}</span>
            <span className="text-gray-400">완료 {member.done}</span>
          </div>
        </div>
      </button>

      {expanded && member.items.length > 0 && (
        <div className="mt-2 ml-3 pl-3 border-l-2 border-blue-200 space-y-1.5 py-2">
          {member.items
            .sort((a, b) => {
              const order = (i: WorkItem) => isInProgress(i.status) ? 0 : isDone(i.status) ? 2 : 1;
              return order(a) - order(b);
            })
            .slice(0, 15)
            .map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isInProgress(item.status) ? "bg-blue-500" :
                  isDone(item.status) ? "bg-gray-300" : "bg-yellow-400"
                }`} />
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-700 hover:text-blue-600 truncate flex-1"
                >
                  {item.title}
                </a>
                <span className="text-gray-400 shrink-0">{item.project}</span>
                {item.dueDate && (
                  <span className={`shrink-0 ${
                    new Date(item.dueDate) < new Date() && !isDone(item.status)
                      ? "text-red-500 font-medium" : "text-gray-400"
                  }`}>
                    {formatShortDate(item.dueDate)}
                  </span>
                )}
              </div>
            ))}
          {member.items.length > 15 && (
            <p className="text-xs text-gray-400">... 외 {member.items.length - 15}건</p>
          )}
        </div>
      )}
    </div>
  );
}
