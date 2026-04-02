"use client";

import type { WorkItem } from "@/lib/notion";

interface Props {
  items: WorkItem[];
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isUrgent(item: WorkItem): boolean {
  if (item.priority === "긴급" || item.priority === "높음" || item.priority === "High" || item.priority === "Urgent") return true;
  if (!item.dueDate) return false;
  const diff = new Date(item.dueDate).getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // 3일 이내
}

function isInProgress(status: string): boolean {
  const keywords = ["진행", "진행중", "진행 중", "in progress", "doing", "작업중", "작업 중"];
  return keywords.some((k) => status.toLowerCase().includes(k.toLowerCase()));
}

function isDone(status: string): boolean {
  const keywords = ["완료", "done", "complete", "finished", "closed", "종료"];
  return keywords.some((k) => status.toLowerCase().includes(k.toLowerCase()));
}

export default function SummaryCards({ items }: Props) {
  const total = items.length;
  const done = items.filter((i) => isDone(i.status)).length;
  const inProgress = items.filter((i) => isInProgress(i.status)).length;
  const overdue = items.filter((i) => !isDone(i.status) && isOverdue(i.dueDate)).length;
  const urgent = items.filter((i) => !isDone(i.status) && isUrgent(i)).length;

  const cards = [
    { label: "전체 작업", value: total, color: "bg-blue-50 text-blue-700 border-blue-200" },
    { label: "진행중", value: inProgress, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { label: "완료", value: done, color: "bg-gray-50 text-gray-600 border-gray-200" },
    { label: "긴급/임박", value: urgent, color: "bg-amber-50 text-amber-700 border-amber-200" },
    { label: "기한 초과", value: overdue, color: "bg-red-50 text-red-700 border-red-200" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-4 ${card.color}`}
        >
          <div className="text-sm font-medium opacity-80">{card.label}</div>
          <div className="text-2xl font-bold mt-1">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
