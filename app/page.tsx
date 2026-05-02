import { getLatestRunFromNotion } from "@/lib/notion-summary";
import type { NotionPayloadDebug, InvalidPayloadInfo } from "@/lib/notion-summary";
import { getLatestRun } from "@/lib/storage";
import {
  getTasksFromNotion,
  calcKPI,
  buildTeams,
  buildOwners,
} from "@/lib/notion-tasks";
import type { DashboardTask } from "@/lib/notion-tasks";
import { buildProjectProgressFallback } from "@/lib/project-progress";
import { isV2Payload, isV1Payload } from "@/lib/types";
import type { WorkStatusPayloadV2, WorkStatusPayload, SlackSignal, ProjectProgress } from "@/lib/types";

import { DashboardHeader }     from "@/components/dashboard/DashboardHeader";
import { SourceMetaPanel }     from "@/components/dashboard/SourceMetaPanel";
import { AllTasksTable }       from "@/components/dashboard/AllTasksTable";
import { TeamOwnerSummary, OwnerAlertSummary } from "@/components/dashboard/TeamOwnerSummary";
import { LegacyResultsView }   from "@/components/dashboard/LegacyResultsView";
import { ProjectProgressView } from "@/components/dashboard/ProjectProgressView";
import { DashboardTabs }       from "@/components/dashboard/DashboardTabs";

export const revalidate = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Slack 신호 중복 제거 — type + summary + related_workstream + related_task 기준
function dedupeSignals(signals: SlackSignal[]): SlackSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = `${s.type}|${s.summary}|${s.related_workstream ?? ""}|${s.related_task ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Slack 신호를 project_progress 항목에 연결 — project 필드 매칭
function distributeSlackSignals(
  projectProgress: ProjectProgress[],
  signals: SlackSignal[]
): { enriched: ProjectProgress[]; unlinked: SlackSignal[] } {
  const projectSet = new Set(projectProgress.map((pp) => pp.project));
  const byProject = new Map<string, SlackSignal[]>();
  const unlinked: SlackSignal[] = [];

  for (const s of signals) {
    if (s.project && projectSet.has(s.project)) {
      if (!byProject.has(s.project)) byProject.set(s.project, []);
      byProject.get(s.project)!.push(s);
    } else {
      unlinked.push(s);
    }
  }

  const enriched = projectProgress.map((pp) => ({
    ...pp,
    slack_signals: dedupeSignals([
      ...(pp.slack_signals ?? []),
      ...(byProject.get(pp.project) ?? []),
    ]),
  }));

  return { enriched, unlinked };
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
  invalidPayloads?: InvalidPayloadInfo[];
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
        invalidPayloads: notionResult.invalid_payloads,
      };
    }
    if (notionResult && "error" in notionResult) {
      return {
        data: null, source: "Notion", createdAt: new Date().toISOString(),
        date: "-", runId: "-", status: "failed",
        fetchError: notionResult.error,
        payloadDebug: notionResult.payloadDebug,
        invalidPayloads: notionResult.invalid_payloads,
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
  let rawTasks: DashboardTask[] = [];
  let rawTaskFetchError: string | undefined;

  const [judgment] = await Promise.all([
    fetchJudgment(),
    getTasksFromNotion()
      .then((tasks) => { rawTasks = tasks; })
      .catch((e: unknown) => {
        console.error("[page] getTasksFromNotion failed:", e);
        rawTaskFetchError = e instanceof Error ? e.message : "알 수 없는 오류";
      }),
  ]);

  const {
    data, source, createdAt, date, runId, status,
    generatedBy, fetchError, payloadDebug, invalidPayloads,
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

  // rawTasks 기반 집계
  const rawKPI    = rawTasks.length ? calcKPI(rawTasks) : (v2?.overview?.metrics ?? {});
  const v2Teams   = Array.isArray(v2?.teams)   ? v2!.teams!   : [];
  const v2Owners  = Array.isArray(v2?.owners)  ? v2!.owners!  : [];
  const rawTeams  = buildTeams(rawTasks, v2Teams);
  const rawOwners = buildOwners(rawTasks, v2Owners);

  // 프로젝트 진행 현황 — Agent payload 우선, 없으면 rawTasks fallback
  const v2ProjectProgress = Array.isArray(v2?.project_progress) ? v2!.project_progress! : [];
  const agentHasProjectProgress = v2ProjectProgress.length > 0;
  const baseProgress: ProjectProgress[] = agentHasProjectProgress
    ? v2ProjectProgress
    : buildProjectProgressFallback(rawTasks);

  // Slack 신호 → 프로젝트 카드 연결
  const allSignals = Array.isArray(v2?.slack_signals) ? v2!.slack_signals! : [];
  const { enriched: projectProgress, unlinked: unlinkedSignals } =
    distributeSlackSignals(baseProgress, allSignals);

  // 오늘 확인 요약 건수
  const confirmCount = projectProgress.reduce(
    (n, pp) => n + (pp.needs_confirmation?.length ?? 0), 0
  );

  // debug
  const parsedTopLevelKeys = data
    ? (payloadDebug?.parsed_top_level_keys?.length
        ? payloadDebug.parsed_top_level_keys
        : Object.keys(data))
    : [];
  const debugOverviewExists = payloadDebug?.overview_exists ?? hasOverview;
  const debugResultsExists  = data ? (payloadDebug?.results_exists ?? ("results" in data)) : false;

  // ── Owner 분리
  // A. 확인 필요 담당자 — Agent payload 기준 (status 판단이 있는 것)
  const alertOwners = v2Owners;
  // B. 전체 작업 담당자 — rawTasks 기준
  const taskOwners  = rawOwners;
  // 팀별 현황 — rawTasks 기준, Agent fallback
  const effectiveTeams = rawTeams.length ? rawTeams : v2Teams;

  // Empty state
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

        {/* 1. Header */}
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

        {/* 2. 수집 상태 + 작은 KPI */}
        <SourceMetaPanel
          sourceMeta={v2?.source_meta}
          runStatus={status}
          warnings={v2?.warnings}
          rawTaskCount={rawTasks.length}
          agentTaskCount={v2?.tasks?.length}
          rawTaskDbConfigured={rawTaskDbConfigured}
          slackSignalCount={allSignals.length}
          metrics={rawKPI}
          confirmCount={confirmCount > 0 ? confirmCount : undefined}
        />

        {/* invalid payload fallback warning */}
        {invalidPayloads && invalidPayloads.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-800 mb-1">
              최신 payload가 파싱에 실패하여 이전 valid payload를 표시합니다.
            </p>
            <p className="text-xs text-amber-700 mb-2">
              조치: 최신 📊 업무현황 요약 page의 payload를 다시 생성해야 합니다.
            </p>
            <div className="space-y-1">
              {invalidPayloads.map((p, i) => (
                <p key={i} className="text-xs font-mono text-amber-600 break-all">
                  {p.run_id ? `run: ${p.run_id}` : `page: ${p.page_id}`} — {p.error.slice(0, 120)}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ── rawTasks만 있을 때 (v2/v1 없음) ─────────────────────────── */}
        {rawTasks.length > 0 && !v2 && !v1 && (
          <>
            <ProjectProgressView
              items={buildProjectProgressFallback(rawTasks)}
              isFallback
            />
            <OwnerAlertSummary owners={alertOwners} />
            <AllTasksTable
              tasks={rawTasks}
              fetchError={rawTaskFetchError}
              rawTaskDbConfigured={rawTaskDbConfigured}
            />
            <DetailSection>
              <TeamOwnerSummary teams={rawTeams} owners={taskOwners} />
            </DetailSection>
          </>
        )}

        {/* ── V2 Dashboard — 탭 구조 ────────────────────────────────────── */}
        {v2 && (
          <DashboardTabs
            overviewSummary={v2.overview.summary}
            ceoActions={Array.isArray(v2.overview?.ceo_action_queue) ? v2.overview.ceo_action_queue : []}
            confirmationQueue={
              Array.isArray(v2.confirmation_queue)
                ? v2.confirmation_queue
                : Array.isArray((v2.overview as unknown as Record<string, unknown>)?.confirmation_queue)
                ? (v2.overview as unknown as Record<string, unknown>).confirmation_queue as import("@/lib/types").ConfirmationQueueItem[]
                : []
            }
            priorityProjects={Array.isArray(v2.overview?.priority_projects) ? v2.overview.priority_projects : undefined}
            projectProgress={projectProgress}
            isFallback={!agentHasProjectProgress}
            alertOwners={alertOwners}
            teams={effectiveTeams}
            taskOwners={taskOwners}
            trend={v2.trend}
            rawTasks={rawTasks}
            rawTaskFetchError={rawTaskFetchError}
            rawTaskDbConfigured={rawTaskDbConfigured}
            unlinkedSignals={unlinkedSignals}
            errors={v2.errors ?? (fetchError ? [fetchError] : [])}
          />
        )}

        {/* ── V1 Fallback ───────────────────────────────────────────────── */}
        {v1 && (
          <>
            {rawTasks.length > 0 && (
              <>
                <ProjectProgressView
                  items={buildProjectProgressFallback(rawTasks)}
                  isFallback
                />
                <OwnerAlertSummary owners={alertOwners} />
                <AllTasksTable
                  tasks={rawTasks}
                  fetchError={rawTaskFetchError}
                  rawTaskDbConfigured={rawTaskDbConfigured}
                />
                <DetailSection>
                  <TeamOwnerSummary teams={rawTeams} owners={taskOwners} />
                </DetailSection>
              </>
            )}
            <LegacyResultsView results={v1.results} />
          </>
        )}

        {/* ── normalize warnings (v2 데이터 자동 보정 결과) ──────────────── */}
        {payloadDebug?.normalize_warnings && payloadDebug.normalize_warnings.length > 0 && (
          <div className="mt-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 text-sm">
            <p className="font-semibold text-sky-800 mb-1">
              payload 자동 보정 ({payloadDebug.normalize_warnings.length}건)
            </p>
            <div className="space-y-0.5">
              {payloadDebug.normalize_warnings.map((w, i) => (
                <p key={i} className="text-xs font-mono text-sky-700">{w}</p>
              ))}
            </div>
          </div>
        )}

        {/* ── Unknown format ────────────────────────────────────────────── */}
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
            <p className="font-mono text-xs text-yellow-700">
              project_progress count: {payloadDebug?.project_progress_count ?? 0}
            </p>
            <p className="font-mono text-xs text-yellow-700">payload nested: {String(payloadDebug?.payload_nested ?? false)}</p>
            {!!payloadDebug?.nested_path?.length && (
              <p className="font-mono text-xs text-yellow-700">nested path: {payloadDebug.nested_path.join(" > ")}</p>
            )}
            {!!payloadDebug?.validate_error && (
              <p className="font-mono text-xs text-red-700 font-semibold">
                validate error: {payloadDebug.validate_error}
              </p>
            )}
            {!!payloadDebug?.normalize_warnings?.length && (
              <div>
                <p className="font-mono text-xs text-yellow-700 font-semibold">normalize warnings:</p>
                {payloadDebug.normalize_warnings.map((w, i) => (
                  <p key={i} className="font-mono text-xs text-yellow-600 ml-2">• {w}</p>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}

// ── 상세 보기 접힘 영역 ───────────────────────────────────────────────────────

function DetailSection({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-10 group">
      <summary className="cursor-pointer inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-gray-600 select-none list-none py-1">
        <span className="group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span>
        <span>상세 보기 (전체 작업 담당자 · 직원 커버리지 · Slack · 오류/경고)</span>
      </summary>
      <div className="mt-2">
        {children}
      </div>
    </details>
  );
}
