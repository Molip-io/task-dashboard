import { getLatestRunFromNotion } from "@/lib/notion-summary";
import type { NotionPayloadDebug } from "@/lib/notion-summary";
import { getLatestRun } from "@/lib/storage";
import {
  getTasksFromNotion,
  calcKPI,
  buildProjects,
  buildTeams,
  buildOwners,
} from "@/lib/notion-tasks";
import { isV2Payload, isV1Payload } from "@/lib/types";
import type { WorkStatusPayloadV2, WorkStatusPayload } from "@/lib/types";

import { DashboardHeader }     from "@/components/dashboard/DashboardHeader";
import { WarningErrorPanel }   from "@/components/dashboard/WarningErrorPanel";
import { SourceMetaPanel }     from "@/components/dashboard/SourceMetaPanel";
import { OverviewMetricsGrid } from "@/components/dashboard/OverviewMetricsGrid";
import { AttentionList }       from "@/components/dashboard/AttentionList";
import { ProjectStatusGrid }   from "@/components/dashboard/ProjectStatusGrid";
import { AllTasksTable }       from "@/components/dashboard/AllTasksTable";
import { TeamOwnerSummary }    from "@/components/dashboard/TeamOwnerSummary";
import { SlackSignalsList }    from "@/components/dashboard/SlackSignalsList";
import { TrendSummary }        from "@/components/dashboard/TrendSummary";
import { LegacyResultsView }   from "@/components/dashboard/LegacyResultsView";
import { Section }             from "@/components/dashboard/shared";

export const revalidate = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchJudgment(): Promise<{
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
  // 1. Notion 업무현황 요약 우선
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
    // fall through
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
  // 두 소스를 병렬 조회
  const [judgment, rawTasks] = await Promise.all([
    fetchJudgment(),
    getTasksFromNotion().catch((e) => {
      console.error("[page] getTasksFromNotion failed:", e);
      return [];
    }),
  ]);

  const {
    data, source, createdAt, date, runId, status,
    generatedBy, fetchError, payloadDebug,
  } = judgment;

  const rawTaskDbConfigured = !!process.env.NOTION_TASK_DATABASE_ID;

  // v2/v1 판별
  const hasOverview =
    isRecord(data) &&
    "overview" in data &&
    isRecord((data as Record<string, unknown>).overview);
  const hasResultsArray =
    isRecord(data) &&
    "results" in data &&
    Array.isArray((data as Record<string, unknown>).results);

  const isV2 = hasOverview && isV2Payload(data);
  const isV1 = !hasOverview && hasResultsArray && isV1Payload(data);

  const v2 = isV2 ? (data as unknown as WorkStatusPayloadV2) : null;
  const v1 = isV1 ? (data as unknown as WorkStatusPayload) : null;

  // rawTasks 기반 집계 (DB 미설정이면 빈 배열)
  const rawKPI      = rawTasks.length ? calcKPI(rawTasks) : (v2?.overview?.metrics ?? {});
  const rawProjects = buildProjects(rawTasks, v2?.projects ?? []);
  const rawTeams    = buildTeams(rawTasks, v2?.teams ?? []);
  const rawOwners   = buildOwners(rawTasks, v2?.owners ?? []);

  // debug
  const parsedTopLevelKeys = data
    ? (payloadDebug?.parsed_top_level_keys?.length
        ? payloadDebug.parsed_top_level_keys
        : Object.keys(data))
    : [];
  const debugOverviewExists = payloadDebug?.overview_exists ?? hasOverview;
  const debugResultsExists  = data ? (payloadDebug?.results_exists ?? ("results" in data)) : false;

  // Empty state — judgment도 없고 rawTasks도 없을 때
  if (!data && rawTasks.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {fetchError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              판단 데이터 로드 오류: {fetchError}
            </div>
          )}
          <div className="text-center py-24 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-medium">아직 수집된 데이터가 없습니다.</p>
            <p className="text-sm mt-1">
              NOTION_TASK_DATABASE_ID와 NOTION_WORK_STATUS_SUMMARY_DATABASE_ID를 설정하세요.
            </p>
          </div>
        </div>
      </main>
    );
  }

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

        {/* 오류 패널 */}
        <WarningErrorPanel
          errors={v2?.errors ?? (fetchError ? [fetchError] : [])}
        />

        {/* 수집 출처 + partial 안내 + warnings */}
        <SourceMetaPanel
          sourceMeta={v2?.source_meta}
          runStatus={status}
          warnings={v2?.warnings}
          rawTaskCount={rawTasks.length}
          agentTaskCount={v2?.tasks?.length}
          rawTaskDbConfigured={rawTaskDbConfigured}
        />

        {/* ── rawTasks가 있을 때 항상 표시 (v2/v1/unknown 무관) ─────────── */}
        {rawTasks.length > 0 && !v2 && !v1 && (
          <>
            <OverviewMetricsGrid metrics={rawKPI} />
            <ProjectStatusGrid projects={rawProjects} />
            <AllTasksTable tasks={rawTasks} />
            <TeamOwnerSummary teams={rawTeams} owners={rawOwners} />
          </>
        )}

        {/* ── V2 Dashboard ──────────────────────────────────────────────── */}
        {v2 && (
          <>
            {/* 1. 오늘 확인할 항목 — Agent 판단 */}
            <Section title="오늘 확인할 항목">
              <AttentionList items={v2.overview.top_attention_items ?? []} />
            </Section>

            {/* 2. KPI — rawTasks 기준 (없으면 Agent metrics fallback) */}
            <OverviewMetricsGrid metrics={rawKPI} />

            {/* 3. 프로젝트 — rawTasks 집계 + Agent 리스크 오버레이 */}
            <ProjectStatusGrid projects={rawProjects.length ? rawProjects : (v2.projects ?? [])} />

            {/* 4. 전체 작업 테이블 — rawTasks 기준 */}
            <AllTasksTable tasks={rawTasks} />

            {/* 5. 팀 / 담당자 — rawTasks 집계 + Agent 오버레이 */}
            <TeamOwnerSummary
              teams={rawTeams.length ? rawTeams : v2.teams}
              owners={rawOwners.length ? rawOwners : v2.owners}
            />

            {/* 6. Slack 신호 — Agent */}
            <SlackSignalsList signals={v2.slack_signals ?? []} />

            {/* 7. 지난 실행 대비 변화 — Agent */}
            <TrendSummary trend={v2.trend} />

            {/* 전체 요약 */}
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
        {v1 && (
          <>
            {rawTasks.length > 0 && (
              <>
                <OverviewMetricsGrid metrics={rawKPI} />
                <AllTasksTable tasks={rawTasks} />
                <TeamOwnerSummary teams={rawTeams} owners={rawOwners} />
              </>
            )}
            <LegacyResultsView results={v1.results} />
          </>
        )}

        {/* ── Unknown format (v2/v1 모두 아닌 경우) ────────────────────── */}
        {!v2 && !v1 && data && (
          <div className="mt-8 p-4 space-y-2 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            <p className="font-medium">
              판단 payload 형식을 인식할 수 없습니다 (overview / results 필드 없음).
            </p>
            <p className="font-mono text-xs text-yellow-700">latest run_id: {runId}</p>
            <p className="font-mono text-xs text-yellow-700">raw payload type: {payloadDebug?.raw_payload_property_type ?? "unknown"}</p>
            <p className="font-mono text-xs text-yellow-700">raw payload length: {payloadDebug?.raw_payload_length ?? 0}</p>
            <p className="font-mono text-xs text-yellow-700 break-all">
              parsed top-level keys: {parsedTopLevelKeys.join(", ") || "(none)"}
            </p>
            {!!payloadDebug?.raw_payload_preview && (
              <p className="font-mono text-xs text-yellow-700 break-all">
                raw payload preview: {payloadDebug.raw_payload_preview}
              </p>
            )}
            <p className="font-mono text-xs text-yellow-700">overview exists: {String(debugOverviewExists)}</p>
            <p className="font-mono text-xs text-yellow-700">results exists: {String(debugResultsExists)}</p>
            <p className="font-mono text-xs text-yellow-700">payload nested: {String(payloadDebug?.payload_nested ?? false)}</p>
            {!!payloadDebug?.nested_path?.length && (
              <p className="font-mono text-xs text-yellow-700">nested path: {payloadDebug.nested_path.join(" > ")}</p>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
