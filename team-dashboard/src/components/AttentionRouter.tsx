"use client";

import { useMemo, useState } from "react";
import type { WorkItem } from "@/lib/notion";
import type { SlackData, SlackMessage, SlackCategory } from "@/lib/slack";
import type { Alert } from "@/lib/bottlenecks";
import { isDone, isInProgress, daysBetween, formatShortDate } from "@/lib/status";

interface Props {
  items: WorkItem[];
  alerts: Alert[];
  slack?: SlackData;
}

// ── Section 1: BottleneckAlerts ──

const SEVERITY_GROUPS = [
  { label: "즉시 조치 필요", min: 70, color: "border-red-300 bg-red-50", dot: "bg-red-500", text: "text-red-700" },
  { label: "확인 필요", min: 40, color: "border-amber-300 bg-amber-50", dot: "bg-amber-500", text: "text-amber-700" },
  { label: "참고", min: 0, color: "border-gray-200 bg-gray-50", dot: "bg-gray-400", text: "text-gray-600" },
] as const;

const RULE_LABELS: Record<string, string> = {
  overdue: "마감 초과",
  deadline_imminent: "마감 임박",
  stale: "장기 체류",
  review_ignored: "확인 방치",
  p0_no_deadline: "0순위 미마감",
  long_paused: "일시정지 장기화",
};

export function BottleneckAlerts({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
        <p className="text-emerald-700 font-medium">All clear — 이번 주 병목 없음</p>
      </div>
    );
  }

  const groupCounts = SEVERITY_GROUPS.map((group, idx) => {
    const upper = idx > 0 ? SEVERITY_GROUPS[idx - 1].min : Infinity;
    return { ...group, count: alerts.filter((a) => a.severity >= group.min && a.severity < upper).length };
  }).filter((g) => g.count > 0);

  return (
    <div className="space-y-4">
      {/* Summary bar — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full rounded-xl border bg-white px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          {groupCounts.map((g) => (
            <span key={g.label} className={`text-sm font-medium ${g.text}`}>
              {g.label} {g.count}건
            </span>
          ))}
        </div>
        <span className="text-xs text-gray-400">{expanded ? "▼ 접기" : "▶ 상세 보기"}</span>
      </button>

      {/* Detail list — collapsed by default */}
      {expanded && SEVERITY_GROUPS.map((group, idx) => {
        const upper = idx > 0 ? SEVERITY_GROUPS[idx - 1].min : Infinity;
        const groupAlerts = alerts.filter((a) => a.severity >= group.min && a.severity < upper);
        if (groupAlerts.length === 0) return null;

        return (
          <div key={group.label} className={`rounded-xl border ${group.color} overflow-hidden`}>
            <div className="px-4 py-2 border-b border-inherit">
              <h4 className={`text-sm font-semibold ${group.text}`}>
                {group.label} ({groupAlerts.length})
              </h4>
            </div>
            <ul className="divide-y divide-inherit">
              {groupAlerts.map((alert) => (
                <li key={`${alert.rule}-${alert.item.id}`} className="px-4 py-3 flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full ${group.dot} shrink-0 mt-1.5`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={alert.item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:underline truncate"
                      >
                        {alert.item.title}
                      </a>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/70 text-gray-500 border">
                        {RULE_LABELS[alert.rule] || alert.rule}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {alert.item.project} · {alert.item.assignee} · {alert.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ── Section 2: TeamHeatmap ──

interface TeamMember {
  name: string;
  inProgress: number;
  todo: number;
  done: number;
  alertCount: number;
  items: WorkItem[];
}

export function TeamHeatmap({ items, alerts }: { items: WorkItem[]; alerts: Alert[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const teamData = useMemo(() => {
    const byTeam = new Map<string, Map<string, WorkItem[]>>();
    for (const item of items) {
      const team = item.team || "미분류";
      const assignee = item.assignee || "미지정";
      if (!byTeam.has(team)) byTeam.set(team, new Map());
      const members = byTeam.get(team)!;
      if (!members.has(assignee)) members.set(assignee, []);
      members.get(assignee)!.push(item);
    }

    const alertsByAssignee = new Map<string, number>();
    for (const a of alerts) {
      const name = a.item.assignee;
      alertsByAssignee.set(name, (alertsByAssignee.get(name) || 0) + 1);
    }

    return Array.from(byTeam.entries())
      .map(([team, members]) => ({
        team,
        members: Array.from(members.entries())
          .map(([name, memberItems]): TeamMember => ({
            name,
            inProgress: memberItems.filter((i) => isInProgress(i.status)).length,
            todo: memberItems.filter((i) => !isDone(i.status) && !isInProgress(i.status)).length,
            done: memberItems.filter((i) => isDone(i.status)).length,
            alertCount: alertsByAssignee.get(name) || 0,
            items: memberItems.filter((i) => !isDone(i.status)),
          }))
          .sort((a, b) => b.inProgress - a.inProgress),
      }))
      .sort((a, b) => b.members.reduce((s, m) => s + m.inProgress, 0) - a.members.reduce((s, m) => s + m.inProgress, 0));
  }, [items, alerts]);

  return (
    <div className="space-y-3">
      {teamData.map(({ team, members }) => (
        <div key={team} className="bg-white rounded-xl border overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <h4 className="text-sm font-semibold text-gray-700">
              {team} ({members.length}명)
            </h4>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {members.filter((m) => m.name !== "미지정").map((member) => {
              const overloaded = member.inProgress >= 5;
              const isExpanded = expanded === `${team}-${member.name}`;
              return (
                <div key={member.name}>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : `${team}-${member.name}`)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      overloaded ? "border-red-200 bg-red-50" : "border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{member.name}</span>
                      {member.alertCount > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                          {member.alertCount}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs">
                      <span className="text-blue-600">진행 {member.inProgress}</span>
                      <span className="text-yellow-600">대기 {member.todo}</span>
                      <span className="text-gray-400">완료 {member.done}</span>
                    </div>
                    {overloaded && (
                      <p className="text-xs text-red-600 mt-1">과부하 주의</p>
                    )}
                  </button>
                  {isExpanded && member.items.length > 0 && (
                    <div className="mt-1 ml-3 pl-3 border-l-2 border-blue-200 space-y-1 py-2">
                      {member.items.slice(0, 8).map((item) => (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-gray-600 hover:text-blue-600 truncate"
                        >
                          {item.status.includes("진행") ? "🔵" : "🟡"} {item.title}
                        </a>
                      ))}
                      {member.items.length > 8 && (
                        <p className="text-xs text-gray-400">... 외 {member.items.length - 8}건</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section 3: WeeklyDigest ──

const CATEGORY_CONFIG: Record<SlackCategory, { label: string; icon: string; color: string }> = {
  issue: { label: "이슈", icon: "🚨", color: "text-red-700" },
  schedule: { label: "일정", icon: "📅", color: "text-purple-700" },
  action: { label: "액션", icon: "⚡", color: "text-amber-700" },
  update: { label: "현황", icon: "📋", color: "text-blue-700" },
};

export function WeeklyDigest({ items, slack }: { items: WorkItem[]; slack?: SlackData }) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const completedThisWeek = items.filter(
    (i) => isDone(i.status) && i.lastEdited && daysBetween(i.lastEdited, now) <= 7
  );
  const newThisWeek = items.filter(
    (i) => i.lastEdited && new Date(i.lastEdited) >= weekAgo && !isDone(i.status)
  );

  // sprint progress
  const sprints = [...new Set(items.map((i) => i.sprint).filter(Boolean))].sort();
  const latestSprint = sprints[sprints.length - 1];
  const sprintItems = latestSprint ? items.filter((i) => i.sprint === latestSprint) : [];
  const sprintDone = sprintItems.filter((i) => isDone(i.status)).length;
  const sprintTotal = sprintItems.length;
  const sprintPct = sprintTotal > 0 ? Math.round((sprintDone / sprintTotal) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b">
        <h4 className="text-sm font-semibold text-gray-700">주간 다이제스트</h4>
      </div>
      <div className="p-4 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <div className="text-2xl font-bold text-emerald-700">{completedThisWeek.length}</div>
            <div className="text-xs text-emerald-600">이번 주 완료</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-700">{newThisWeek.length}</div>
            <div className="text-xs text-blue-600">신규 등록</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-700">{sprintPct}%</div>
            <div className="text-xs text-purple-600">
              {latestSprint || "Sprint"} ({sprintDone}/{sprintTotal})
            </div>
          </div>
        </div>

        {/* Sprint progress bar */}
        {latestSprint && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{latestSprint}</span>
              <span>{sprintDone}/{sprintTotal} 완료</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all"
                style={{ width: `${sprintPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Slack digest */}
        {slack && slack.messages.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">슬랙 주요 논의 ({slack.messages.length}건)</p>
            <div className="space-y-1">
              {(["issue", "action", "schedule"] as SlackCategory[]).map((cat) => {
                const msgs = slack.messages.filter((m) => m.category === cat);
                if (msgs.length === 0) return null;
                const cfg = CATEGORY_CONFIG[cat];
                return (
                  <div key={cat} className="flex items-start gap-2">
                    <span className="text-xs shrink-0">{cfg.icon}</span>
                    <span className="text-xs text-gray-600">
                      {cfg.label} {msgs.length}건 — {msgs.slice(0, 2).map((m) => m.summary.slice(0, 30)).join(", ")}
                      {msgs.length > 2 && " ..."}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!slack && (
          <p className="text-xs text-gray-400 text-center py-2">
            슬랙 데이터 없음 — SLACK_BOT_TOKEN을 확인하세요
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function AttentionRouter({ items, alerts, slack }: Props) {
  return (
    <div className="space-y-6">
      {/* Section 1: 병목 경고 */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-3">병목 경고</h3>
        <BottleneckAlerts alerts={alerts} />
      </div>

      {/* Section 2: 팀원 업무 히트맵 */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-3">팀원 업무 현황</h3>
        <TeamHeatmap items={items} alerts={alerts} />
      </div>

      {/* Section 3: 주간 다이제스트 */}
      <WeeklyDigest items={items} slack={slack} />
    </div>
  );
}
