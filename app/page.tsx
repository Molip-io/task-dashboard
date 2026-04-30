import { getLatestRunFromNotion } from "@/lib/notion-summary";
import type { NotionPayloadDebug } from "@/lib/notion-summary";
import { getLatestRun } from "@/lib/storage";
import { isV2Payload, isV1Payload } from "@/lib/types";
import type {
  WorkStatusPayloadV2,
  WorkStatusPayload,
} from "@/lib/types";

import { DashboardHeader }     from "@/components/dashboard/DashboardHeader";
import { WarningErrorPanel }   from "@/components/dashboard/WarningErrorPanel";
import { OverviewMetricsGrid } from "@/components/dashboard/OverviewMetricsGrid";
import { AttentionList }       from "@/components/dashboard/AttentionList";
import { ProjectStatusGrid }   from "@/components/dashboard/ProjectStatusGrid";
import { TasksTable }          from "@/components/dashboard/TasksTable";
import { TeamOwnerSummary }    from "@/components/dashboard/TeamOwnerSummary";
import { SlackSignalsList }    from "@/components/dashboard/SlackSignalsList";
import { LegacyResultsView }   from "@/components/dashboard/LegacyResultsView";
import { Section }             from "@/components/dashboard/shared";

export const revalidate = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchLatest(): Promise<{
  data: Record<string, unknown> | null;
  source: string;
  createdAt: string;
  date: string;
  runId: string;
  status: string;
  generatedBy?: string;
  fetchError?: string;
  payloadDebug?: NotionPayloadDebug;
}> {
  // 1. Notion 우선
  try {
    const notionResult = await getLatestRunFromNotion();
    if (notionResult && "run" in notionResult) {
      const run = notionResult.run;
      const sourceMeta = run.source_meta;
      const generatedBy =
        isRecord(sourceMeta) && typeof sourceMeta.generated_by === "string"
          ? sourceMeta.generated_by
          : undefined;
      return {
        data: run,
        source: "Notion",
        createdAt: run.created_at,
        date: run.date,
        runId: run.run_id,
        status: run.status,
        generatedBy,
        payloadDebug: notionResult.payloadDebug,
      };
    }
    if (notionResult && "error" in notionResult) {
      return {
        data: null, source: "Notion", createdAt: new Date().toISOString(),
        date: "-", runId: "-", status: "failed",
        fetchError: notionResult.error,
        payloadDebug: notionResult.payloadDebug,
      };
    }
  } catch {
    // fall through to Supabase
  }

  // 2. Supabase fallback
  try {
    const run = await getLatestRun();
    if (!run) return {
      data: null, source: "Supabase", createdAt: new Date().toISOString(),
      date: "-", runId: "-", status: "failed",
    };
    return {
      data: run as unknown as Record<string, unknown>,
      source: "Supabase",
      createdAt: run.created_at,
      date: run.date,
      runId: run.run_id,
      status: run.status,
    };
  } catch (err) {
    return {
      data: null, source: "알 수 없음", createdAt: new Date().toISOString(),
      date: "-", runId: "-", status: "failed",
      fetchError: err instanceof Error ? err.message : "알 수 없는 오류",
    };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const {
    data,
    source,
    createdAt,
    date,
    runId,
    status,
    generatedBy,
    fetchError,
    payloadDebug,
  } = await fetchLatest();

  // Empty state
  if (!data) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {fetchError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              데이터 로드 오류: {fetchError}
            </div>
          )}
          <div className="text-center py-24 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-medium">아직 수집된 데이터가 없습니다.</p>
            <p className="text-sm mt-1">
              Agent가 Notion DB에 payload를 저장하면 여기에 표시됩니다.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const hasOverview =
    isRecord(data) &&
    "overview" in data &&
    isRecord((data as Record<string, unknown>).overview);
  const hasResultsArray =
    isRecord(data) &&
    "results" in data &&
    Array.isArray((data as Record<string, unknown>).results);

  // v2 우선 판단: overview가 있으면 v2 렌더링
  const isV2 = hasOverview && isV2Payload(data);
  // v1 fallback: overview가 없고 results가 배열일 때만
  const isV1 = !hasOverview && hasResultsArray && isV1Payload(data);

  const v2 = isV2 ? (data as unknown as WorkStatusPayloadV2) : null;
  const v1 = isV1 ? (data as unknown as WorkStatusPayload) : null;
  const parsedTopLevelKeys =
    payloadDebug?.parsed_top_level_keys?.length
      ? payloadDebug.parsed_top_level_keys
      : Object.keys(data);
  const debugOverviewExists = payloadDebug?.overview_exists ?? hasOverview;
  const debugResultsExists =
    payloadDebug?.results_exists ??
    ("results" in data);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-0">

        {/* Header */}
        <DashboardHeader
          date={date}
          runId={runId}
          createdAt={createdAt}
          status={v2?.overview?.overall_status ?? v2?.overview?.status ?? status}
          source={source}
          generatedBy={generatedBy ?? v2?.source_meta?.generated_by}
          warningCount={v2?.warnings?.length ?? 0}
          errorCount={v2?.errors?.length ?? 0}
        />

        {/* Warnings / Errors */}
        <WarningErrorPanel
          errors={v2?.errors ?? (fetchError ? [fetchError] : [])}
          warnings={v2?.warnings}
        />

        {/* ── V2 Dashboard ──────────────────────────────────────────────── */}
        {v2 && (
          <>
            {/* 1. 오늘 확인할 항목 — 최우선 */}
            <Section title="오늘 확인할 항목">
              <AttentionList items={v2.overview.top_attention_items ?? []} />
            </Section>

            {/* 2. KPI 지표 */}
            <OverviewMetricsGrid metrics={v2.overview.metrics} />

            {/* 3. 위험 프로젝트 */}
            <ProjectStatusGrid projects={v2.projects ?? []} />

            {/* 4. 핵심 작업 테이블 */}
            <TasksTable tasks={v2.tasks ?? []} />

            {/* 5. 팀 / 담당자 쏠림 */}
            <TeamOwnerSummary teams={v2.teams} owners={v2.owners} />

            {/* 6. Slack 신호 */}
            <SlackSignalsList signals={v2.slack_signals ?? []} />

            {/* overview 요약문 (보조) */}
            {v2.overview.summary && (
              <Section title="전체 요약">
                <p className="text-sm text-gray-600 leading-relaxed bg-white rounded-xl border border-gray-100 p-4">
                  {v2.overview.summary}
                </p>
              </Section>
            )}
          </>
        )}

        {/* ── V1 Fallback ───────────────────────────────────────────────── */}
        {v1 && <LegacyResultsView results={v1.results} />}

        {/* ── Unknown format ────────────────────────────────────────────── */}
        {!v2 && !v1 && (
          <div className="mt-8 p-4 space-y-2 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            <p className="font-medium">
              payload 형식을 인식할 수 없습니다 (overview / results 필드 없음).
            </p>
            <p className="font-mono text-xs text-yellow-700">
              latest run_id: {runId}
            </p>
            <p className="font-mono text-xs text-yellow-700">
              raw payload type: {payloadDebug?.raw_payload_property_type ?? "unknown"}
            </p>
            <p className="font-mono text-xs text-yellow-700">
              raw payload length: {payloadDebug?.raw_payload_length ?? 0}
            </p>
            <p className="font-mono text-xs text-yellow-700 break-all">
              parsed top-level keys: {parsedTopLevelKeys.join(", ") || "(none)"}
            </p>
            {!!payloadDebug?.raw_payload_preview && (
              <p className="font-mono text-xs text-yellow-700 break-all">
                raw payload preview: {payloadDebug.raw_payload_preview}
              </p>
            )}
            <p className="font-mono text-xs text-yellow-700">
              overview exists: {String(debugOverviewExists)}
            </p>
            <p className="font-mono text-xs text-yellow-700">
              results exists: {String(debugResultsExists)}
            </p>
            <p className="font-mono text-xs text-yellow-700">
              payload nested: {String(payloadDebug?.payload_nested ?? false)}
            </p>
            {!!payloadDebug?.nested_path?.length && (
              <p className="font-mono text-xs text-yellow-700">
                nested path: {payloadDebug.nested_path.join(" > ")}
              </p>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
