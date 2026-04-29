import type { StatusLevel, RunStatus, Urgency, SignalType } from "@/lib/types";

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  normal:   { label: "정상",    cls: "bg-green-100 text-green-800" },
  watch:    { label: "관찰",    cls: "bg-blue-100 text-blue-800" },
  risk:     { label: "주의",    cls: "bg-orange-100 text-orange-800" },
  blocked:  { label: "막힘",    cls: "bg-red-100 text-red-800" },
  success:  { label: "수집 완료", cls: "bg-green-100 text-green-800" },
  partial:  { label: "부분 수집", cls: "bg-yellow-100 text-yellow-800" },
  failed:   { label: "실패",    cls: "bg-red-100 text-red-800" },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: StatusLevel | RunStatus | string;
  size?: "xs" | "sm" | "md";
}) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  const sz = size === "xs" ? "text-xs px-1.5 py-0.5" : size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sz} ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Urgency badge ─────────────────────────────────────────────────────────────
const URGENCY_CONFIG: Record<Urgency, { label: string; cls: string }> = {
  low:      { label: "낮음",   cls: "bg-gray-100 text-gray-600" },
  medium:   { label: "보통",   cls: "bg-yellow-100 text-yellow-700" },
  high:     { label: "높음",   cls: "bg-orange-100 text-orange-700" },
  critical: { label: "긴급",   cls: "bg-red-100 text-red-700 ring-1 ring-red-300" },
};

export function UrgencyBadge({ urgency }: { urgency: Urgency | string }) {
  const cfg = URGENCY_CONFIG[urgency as Urgency] ?? { label: urgency, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Signal type badge ─────────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<string, { label: string; cls: string }> = {
  blocker:          { label: "블로커",     cls: "bg-red-100 text-red-700" },
  schedule_change:  { label: "일정 변경",  cls: "bg-orange-100 text-orange-700" },
  confirm_request:  { label: "확인 요청",  cls: "bg-blue-100 text-blue-700" },
  decision_waiting: { label: "결정 대기",  cls: "bg-purple-100 text-purple-700" },
  discussion_spike: { label: "논의 급증",  cls: "bg-yellow-100 text-yellow-700" },
  repeated_issue:   { label: "반복 이슈",  cls: "bg-pink-100 text-pink-700" },
};

export function SignalBadge({ type }: { type: SignalType | string }) {
  const cfg = SIGNAL_CONFIG[type] ?? { label: type, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Card border by status ─────────────────────────────────────────────────────
export const STATUS_BORDER: Record<string, string> = {
  normal:  "border-green-200",
  watch:   "border-blue-300",
  risk:    "border-orange-300",
  blocked: "border-red-400",
};

export function statusBorder(status: string) {
  return STATUS_BORDER[status] ?? "border-gray-200";
}

// ── Section wrapper ───────────────────────────────────────────────────────────
export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-8 ${className ?? ""}`}>
      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
