import type { WorkItem } from "@/lib/notion";

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function isUrgent(item: WorkItem): boolean {
  if (item.priority === "긴급" || item.priority === "높음" || item.priority === "High" || item.priority === "Urgent") return true;
  if (!item.dueDate) return false;
  const diff = new Date(item.dueDate).getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // 3일 이내
}

export function isInProgress(status: string): boolean {
  const keywords = ["진행", "진행중", "진행 중", "in progress", "doing", "작업중", "작업 중"];
  return keywords.some((k) => status.toLowerCase().includes(k.toLowerCase()));
}

export function isDone(status: string): boolean {
  const keywords = ["완료", "done", "complete", "finished", "closed", "종료"];
  return keywords.some((k) => status.toLowerCase().includes(k.toLowerCase()));
}

export function isPaused(status: string): boolean {
  return status.includes("정지") || status.includes("pause");
}

export function isReviewPending(status: string): boolean {
  return status.includes("확인") || status.includes("review");
}

export function isHighPriority(priority: string): boolean {
  return priority.includes("0순위") || priority.includes("긴급") || priority.includes("Urgent");
}

export function daysBetween(dateStr: string, now: Date = new Date()): number {
  const d = new Date(dateStr);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
