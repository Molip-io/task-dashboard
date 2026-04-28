import { getLatestRun } from "@/lib/storage";
import { RunHeader } from "@/components/RunHeader";
import { StatusCard } from "@/components/StatusCard";

export const revalidate = 60;

export default async function HomePage() {
  let run = null;
  let fetchError = null;

  try {
    run = await getLatestRun();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "알 수 없는 오류";
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {fetchError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            데이터 로드 오류: {fetchError}
          </div>
        )}

        {!run ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-medium">아직 수집된 데이터가 없습니다.</p>
            <p className="text-sm mt-1">
              Agent가 POST /api/work-status-summaries 로 데이터를 보내면 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            <RunHeader run={run} />
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {run.results.map((result) => (
                <StatusCard key={result.target_key} result={result} />
              ))}
            </div>
            {run.results.length === 0 && (
              <p className="mt-10 text-center text-gray-400 text-sm">결과 항목이 없습니다.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
