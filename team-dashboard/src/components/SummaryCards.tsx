"use client";

import type { WorkItem } from "@/lib/notion";
import { isDone, isInProgress, isOverdue, isUrgent } from "@/lib/status";

interface Props {
  items: WorkItem[];
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
