import { StatusBadge } from "./shared";

interface DashboardHeaderProps {
  date: string;
  runId: string;
  createdAt: string;
  status: string;
  source?: string;
  generatedBy?: string;
  warningCount?: number;
  errorCount?: number;
}

export function DashboardHeader({
  date,
  runId,
  createdAt,
  status,
  source,
  generatedBy,
  warningCount = 0,
  errorCount = 0,
}: DashboardHeaderProps) {
  const updatedLabel = new Date(createdAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const GEN_LABEL: Record<string, string> = {
    agent: "Agent",
    manual: "수동",
    test: "테스트",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-bold text-gray-900">MOLIP 업무현황</h1>
          <StatusBadge status={status} size="md" />
          {errorCount > 0 && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              오류 {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              경고 {warningCount}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-gray-400">
          <span>기준일 <strong className="text-gray-600">{date}</strong></span>
          <span>·</span>
          <span>run <code className="text-gray-500 font-mono">{runId}</code></span>
          <span>·</span>
          <span>업데이트 <strong className="text-gray-600">{updatedLabel}</strong></span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {source && (
          <span className="bg-indigo-50 text-indigo-600 font-medium px-2 py-1 rounded-full">
            📡 {source}
          </span>
        )}
        {generatedBy && GEN_LABEL[generatedBy] && (
          <span className="bg-gray-100 text-gray-600 font-medium px-2 py-1 rounded-full">
            {GEN_LABEL[generatedBy]}
          </span>
        )}
      </div>
    </div>
  );
}
