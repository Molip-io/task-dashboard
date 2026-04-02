"use client";

import { useState, useMemo } from "react";
import type { WorkItem } from "@/lib/notion";

interface Props {
  items: WorkItem[];
}

function statusBadge(status: string) {
  const lower = status.toLowerCase();
  if (["완료", "done", "complete", "finished", "closed"].some((k) => lower.includes(k)))
    return "bg-gray-100 text-gray-600";
  if (["진행", "in progress", "doing", "작업"].some((k) => lower.includes(k)))
    return "bg-blue-100 text-blue-700";
  if (["대기", "waiting", "blocked", "블록", "보류"].some((k) => lower.includes(k)))
    return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate) return false;
  const done = ["완료", "done", "complete", "finished", "closed"].some((k) =>
    status.toLowerCase().includes(k)
  );
  if (done) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

type SortKey = "title" | "status" | "assignee" | "team" | "project" | "sprint" | "dueDate" | "priority";

export default function WorkTable({ items }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.assignee.toLowerCase().includes(q) ||
        i.team.toLowerCase().includes(q) ||
        i.project.toLowerCase().includes(q) ||
        i.status.toLowerCase().includes(q) ||
        i.sprint.toLowerCase().includes(q)
    );
  }, [items, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] || "";
      const bv = b[sortKey] || "";
      const cmp = av.localeCompare(bv, "ko");
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const headers: { key: SortKey; label: string; className?: string }[] = [
    { key: "title", label: "작업명" },
    { key: "status", label: "상태" },
    { key: "assignee", label: "담당자" },
    { key: "team", label: "팀" },
    { key: "project", label: "프로젝트" },
    { key: "sprint", label: "Sprint" },
    { key: "dueDate", label: "마감일" },
    { key: "priority", label: "우선순위" },
  ];

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          placeholder="검색 (작업명, 담당자, 팀, 프로젝트...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <span className="ml-3 text-sm text-gray-500">{sorted.length}건</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                >
                  {h.label}
                  {sortKey === h.key && (sortAsc ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  데이터가 없습니다
                </td>
              </tr>
            ) : (
              sorted.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-[300px]">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate block"
                    >
                      {item.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.assignee}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.team}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.project}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">{item.sprint || "-"}</td>
                  <td className={`px-4 py-3 whitespace-nowrap ${isOverdue(item.dueDate, item.status) ? "text-red-600 font-medium" : ""}`}>
                    {formatDate(item.dueDate)}
                    {isOverdue(item.dueDate, item.status) && " ⚠"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.priority}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
