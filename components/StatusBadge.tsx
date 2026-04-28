import { StatusLevel } from "@/lib/types";

const CONFIG: Record<StatusLevel, { label: string; className: string }> = {
  normal:  { label: "정상",   className: "bg-green-100 text-green-800 border-green-200" },
  watch:   { label: "주의",   className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  risk:    { label: "위험",   className: "bg-orange-100 text-orange-800 border-orange-200" },
  blocked: { label: "블로킹", className: "bg-red-100 text-red-800 border-red-200" },
};

export function StatusBadge({ status }: { status: StatusLevel }) {
  const { label, className } = CONFIG[status] ?? CONFIG.normal;
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${className}`}>
      {label}
    </span>
  );
}
