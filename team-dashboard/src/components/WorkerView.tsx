"use client";

import { useState, useMemo } from "react";
import type { WorkItem } from "@/lib/notion";
import type { Alert } from "@/lib/bottlenecks";
import { isDone, isInProgress, isOverdue, formatShortDate } from "@/lib/status";

interface Props {
  items: WorkItem[];
  alerts: Alert[];
}

interface WorkerSummary {
  name: string;
  team: string;
  inProgress: number;
  todo: number;
  done: number;
  alertCount: number;
  items: WorkItem[];
  alerts: Alert[];
}

const RULE_LABELS: Record<string, string> = {
  overdue: "마감 초과",
  deadline_imminent: "마감 임박",
  stale: "장기 체류",
  review_ignored: "확인 방치",
  p0_no_deadline: "0순위 미마감",
  long_paused: "일시정지 장기화",
};

export default function WorkerView({ items, alerts }: Props) {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  const workers = useMemo((): WorkerSummary[] => {
    const byWorker = new Map<string, WorkItem[]>();
    const teamByWorker = new Map<string, string>();

    for (const item of items) {
      // Split comma-separated assignees into individual entries
      const names = (item.assignee || "미지정")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "미지정");
      for (const name of names) {
        if (!byWorker.has(name)) byWorker.set(name, []);
        byWorker.get(name)!.push(item);
        if (!teamByWorker.has(name)) teamByWorker.set(name, item.team || "미분류");
      }
    }

    const alertsByWorker = new Map<string, Alert[]>();
    for (const a of alerts) {
      const names = (a.item.assignee || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of names) {
        if (!alertsByWorker.has(name)) alertsByWorker.set(name, []);
        alertsByWorker.get(name)!.push(a);
      }
    }

    return Array.from(byWorker.entries())
      .map(([name, workerItems]): WorkerSummary => ({
        name,
        team: teamByWorker.get(name) || "미분류",
        inProgress: workerItems.filter((i) => isInProgress(i.status)).length,
        todo: workerItems.filter((i) => !isDone(i.status) && !isInProgress(i.status)).length,
        done: workerItems.filter((i) => isDone(i.status)).length,
        alertCount: (alertsByWorker.get(name) || []).length,
        items: workerItems,
        alerts: alertsByWorker.get(name) || [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [items, alerts]);

  const selected = workers.find((w) => w.name === selectedWorker);

  return (
    <div className="space-y-4">
      {/* Worker Selection Chips */}
      <div className="bg-white rounded-xl border p-4">
        <p className="text-xs text-gray-500 mb-3">작업자 선택 ({workers.length}명)</p>
        <div className="flex flex-wrap gap-2">
          {workers.map((w) => (
            <button
              key={w.name}
              onClick={() => setSelectedWorker(selectedWorker === w.name ? null : w.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                selectedWorker === w.name
                  ? "bg-blue-600 text-white"
                  : w.alertCount > 0
                    ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {w.name}
              <span className={`text-xs ${selectedWorker === w.name ? "text-blue-200" : "text-gray-400"}`}>
                {w.inProgress}
              </span>
              {w.alertCount > 0 && selectedWorker !== w.name && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Worker Detail */}
      {selected ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          {/* Worker Header */}
          <div className="px-5 py-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selected.name}</h3>
                <span className="text-xs text-gray-500">{selected.team}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-blue-600 font-medium">진행중 {selected.inProgress}</span>
                <span className="text-yellow-600">대기 {selected.todo}</span>
                <span className="text-gray-400">완료 {selected.done}</span>
                {selected.alertCount > 0 && (
                  <span className="text-red-600 font-medium">병목 {selected.alertCount}</span>
                )}
              </div>
            </div>
          </div>

          {/* Alerts for this worker */}
          {selected.alerts.length > 0 && (
            <div className="px-5 py-3 bg-red-50 border-b">
              <p className="text-xs font-semibold text-red-700 mb-2">병목 알림</p>
              <div className="space-y-1">
                {selected.alerts.map((a) => (
                  <div key={`${a.rule}-${a.item.id}`} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-red-700 font-medium shrink-0">
                      {RULE_LABELS[a.rule] || a.rule}
                    </span>
                    <a
                      href={a.item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline truncate"
                    >
                      {a.item.title}
                    </a>
                    <span className="text-red-400 shrink-0">{a.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-5 py-2 font-medium">프로젝트</th>
                  <th className="px-3 py-2 font-medium">작업</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium">마감일</th>
                  <th className="px-3 py-2 font-medium">우선순위</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selected.items
                  .sort((a, b) => {
                    const order = (i: WorkItem) =>
                      isInProgress(i.status) ? 0 : isDone(i.status) ? 2 : 1;
                    return order(a) - order(b);
                  })
                  .map((item) => {
                    const overdue = item.dueDate && isOverdue(item.dueDate) && !isDone(item.status);
                    return (
                      <tr
                        key={item.id}
                        className={`${overdue ? "bg-red-50" : ""} hover:bg-gray-50`}
                      >
                        <td className="px-5 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {item.project || "미분류"}
                        </td>
                        <td className="px-3 py-2.5">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-800 hover:text-blue-600 hover:underline"
                          >
                            {item.title}
                          </a>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                              isInProgress(item.status)
                                ? "bg-blue-100 text-blue-700"
                                : isDone(item.status)
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${
                          overdue ? "text-red-600 font-medium" : "text-gray-500"
                        }`}>
                          {item.dueDate ? formatShortDate(item.dueDate) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">
                          {item.priority || "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">작업자를 선택하면 상세 업무 현황을 볼 수 있습니다</p>
        </div>
      )}
    </div>
  );
}
