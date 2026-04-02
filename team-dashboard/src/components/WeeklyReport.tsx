"use client";

import { useMemo } from "react";
import type { WorkItem } from "@/lib/notion";
import type { SlackData, SlackMessage } from "@/lib/slack";

interface Props {
  items: WorkItem[];
  slack?: SlackData;
}

function formatTs(ts: string) {
  const d = new Date(Number(ts.split(".")[0]) * 1000);
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function MessageBadges({ msg }: { msg: SlackMessage }) {
  return (
    <span className="flex gap-1 shrink-0">
      {msg.isBlocker  && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">블로커</span>}
      {msg.isDecision && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">결정</span>}
      {msg.isAction   && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">액션</span>}
    </span>
  );
}

function SlackMessages({ msgs }: { msgs: SlackMessage[] }) {
  if (msgs.length === 0) return null;
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-medium text-gray-500 mb-2">💬 슬랙 논의 ({msgs.length}건)</p>
      <div className="space-y-2">
        {msgs.map((msg) => (
          <div key={msg.ts} className="flex items-start gap-2 text-sm">
            <MessageBadges msg={msg} />
            <div className="min-w-0 flex-1">
              <p className="text-gray-700 leading-relaxed line-clamp-2">{msg.text}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="font-medium text-gray-500">#{msg.channelName}</span>
                {" · "}{formatTs(msg.ts)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function isDone(status: string): boolean {
  return ["완료", "done", "complete", "finished", "closed", "종료"].some((k) =>
    status.toLowerCase().includes(k.toLowerCase())
  );
}

function isInProgress(status: string): boolean {
  return ["진행", "in progress", "doing", "작업중", "작업 중"].some((k) =>
    status.toLowerCase().includes(k.toLowerCase())
  );
}

interface ProjectReport {
  name: string;
  sprint: string;
  inProgress: WorkItem[];
  done: WorkItem[];
  todo: WorkItem[];
  teams: Map<string, WorkItem[]>;
}

export default function WeeklyReport({ items, slack }: Props) {
  const reports = useMemo((): ProjectReport[] => {
    const map = new Map<string, WorkItem[]>();
    for (const item of items) {
      const key = item.project || "미분류";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries())
      .map(([name, projectItems]) => {
        const inProgress = projectItems.filter((i) => isInProgress(i.status));
        const done = projectItems.filter((i) => isDone(i.status));
        const todo = projectItems.filter((i) => !isDone(i.status) && !isInProgress(i.status));

        const sprints = [...new Set(projectItems.map((i) => i.sprint).filter(Boolean))].sort();
        const currentSprint = sprints[sprints.length - 1] || "";

        const teams = new Map<string, WorkItem[]>();
        for (const item of projectItems) {
          const team = item.team || "미분류";
          if (!teams.has(team)) teams.set(team, []);
          teams.get(team)!.push(item);
        }

        return { name, sprint: currentSprint, inProgress, done, todo, teams };
      })
      .sort((a, b) => b.inProgress.length - a.inProgress.length || b.done.length + b.inProgress.length + b.todo.length - (a.done.length + a.inProgress.length + a.todo.length));
  }, [items]);

  // 채널명 → 프로젝트명 매핑 (정규화 후 부분 문자열 비교)
  const slackByProject = useMemo((): Map<string, SlackMessage[]> => {
    const map = new Map<string, SlackMessage[]>();
    if (!slack) return map;

    const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
    const projectNames = reports.map((r) => r.name);

    // 채널별로 그룹핑 후 프로젝트 매칭
    const byChannel = new Map<string, SlackMessage[]>();
    for (const msg of slack.messages) {
      if (!byChannel.has(msg.channelName)) byChannel.set(msg.channelName, []);
      byChannel.get(msg.channelName)!.push(msg);
    }

    for (const [channelName, msgs] of byChannel) {
      const normCh = normalize(channelName);
      const matched = projectNames.find((name) => {
        const normPrj = normalize(name);
        return normPrj.includes(normCh) || normCh.includes(normPrj);
      });
      const key = matched ?? "__other__";
      if (!map.has(key)) map.set(key, []);
      for (const msg of msgs) map.get(key)!.push(msg);
    }

    return map;
  }, [slack, reports]);

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div className="space-y-6">
      {/* Report Header */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          주간 업무 보고 ({formatDate(monday)} ~ {formatDate(friday)})
        </h2>
        <p className="text-sm text-gray-500">
          전체 {items.length}건 | 진행중 {items.filter((i) => isInProgress(i.status)).length}건 | 완료 {items.filter((i) => isDone(i.status)).length}건
          {slack && <span className="ml-2">| 슬랙 논의 {slack.messages.length}건</span>}
        </p>
        {!slack && (
          <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded-lg inline-block">
            ⚠️ SLACK_BOT_TOKEN 미설정 — .env.local에 추가하면 슬랙 논의가 표시됩니다
          </p>
        )}
      </div>

      {/* Project Sections */}
      {reports
        .filter((r) => r.inProgress.length > 0 || r.todo.length > 0)
        .map((report) => {
          const projectSlack = slackByProject.get(report.name) ?? [];
          return (
            <div key={report.name} className="bg-white rounded-xl border overflow-hidden">
              {/* Project Header */}
              <div className="bg-gray-50 px-5 py-3 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{report.name}</h3>
                  {report.sprint && (
                    <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                      {report.sprint}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-blue-600">진행중 {report.inProgress.length}</span>
                  <span className="text-yellow-600">대기 {report.todo.length}</span>
                  <span className="text-gray-400">완료 {report.done.length}</span>
                  {projectSlack.length > 0 && (
                    <span className="text-indigo-600">💬 {projectSlack.length}</span>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* 팀별 진행 현황 */}
                {Array.from(report.teams.entries()).map(([team, teamItems]) => {
                  const teamInProgress = teamItems.filter((i) => isInProgress(i.status));
                  const teamTodo = teamItems.filter((i) => !isDone(i.status) && !isInProgress(i.status));
                  if (teamInProgress.length === 0 && teamTodo.length === 0) return null;

                  return (
                    <div key={team} className="border-l-2 border-blue-200 pl-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">{team}</h4>

                      {teamInProgress.length > 0 && (
                        <div className="mb-2">
                          <span className="text-xs font-medium text-blue-600 block mb-1">진행중</span>
                          <ul className="space-y-1">
                            {teamInProgress.map((item) => (
                              <li key={item.id} className="text-sm flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                <div className="min-w-0 flex-1">
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {item.title}
                                  </a>
                                  <span className="text-xs text-gray-400 ml-2">{item.assignee}</span>
                                  {item.dueDate && (
                                    <span className="text-xs text-gray-400 ml-1">~{item.dueDate}</span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {teamTodo.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-yellow-600 block mb-1">예정</span>
                          <ul className="space-y-1">
                            {teamTodo.slice(0, 5).map((item) => (
                              <li key={item.id} className="text-sm flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 mt-1.5" />
                                <span className="text-gray-600">{item.title}</span>
                                <span className="text-xs text-gray-400 shrink-0">{item.assignee}</span>
                              </li>
                            ))}
                            {teamTodo.length > 5 && (
                              <li className="text-xs text-gray-400 pl-4">... 외 {teamTodo.length - 5}건</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 이 프로젝트 관련 슬랙 논의 */}
                <SlackMessages msgs={projectSlack} />
              </div>
            </div>
          );
        })}

      {/* 완료 프로젝트 요약 */}
      {reports.filter((r) => r.inProgress.length === 0 && r.todo.length === 0 && r.done.length > 0).length > 0 && (
        <div className="bg-gray-50 rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">활성 작업 없는 프로젝트</h3>
          <div className="flex flex-wrap gap-2">
            {reports
              .filter((r) => r.inProgress.length === 0 && r.todo.length === 0)
              .map((r) => (
                <span key={r.name} className="px-3 py-1 bg-white border rounded-full text-sm text-gray-500">
                  {r.name} ({r.done.length}건 완료)
                </span>
              ))}
          </div>
        </div>
      )}

      {/* 기타 슬랙 논의 (프로젝트 미매칭) */}
      {slack && (slackByProject.get("__other__") ?? []).length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">기타 슬랙 논의</h3>
            <span className="text-xs text-gray-400">{(slackByProject.get("__other__") ?? []).length}건</span>
          </div>
          <div className="p-5">
            <SlackMessages msgs={slackByProject.get("__other__") ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
