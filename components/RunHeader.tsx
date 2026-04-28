import { StoredRun, RunStatus } from "@/lib/types";

const RUN_STATUS_CONFIG: Record<RunStatus, { label: string; className: string }> = {
  success: { label: "수집 완료", className: "bg-green-100 text-green-800 border-green-200" },
  partial: { label: "일부 수집", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  failed:  { label: "수집 실패", className: "bg-red-100 text-red-800 border-red-200" },
};

export function RunHeader({ run }: { run: StoredRun }) {
  const updatedAt = new Date(run.created_at).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  const statusCfg = RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.success;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-200">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">MOLIP 업무현황</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          기준일: <span className="font-medium text-gray-700">{run.date}</span>
          <span className="mx-2 text-gray-300">|</span>
          Run ID: <span className="font-mono text-xs text-gray-600">{run.run_id}</span>
          <span className="mx-2 text-gray-300">|</span>
          업데이트: {updatedAt}
        </p>
      </div>
      <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${statusCfg.className}`}>
        {statusCfg.label}
      </span>
    </div>
  );
}
