"use client";

import { useState } from "react";
import type { SlackSignal, SourceMetaV2 } from "@/lib/types";
import type { DashboardTask } from "@/lib/notion-tasks";
import type { NotionPayloadDebug } from "@/lib/notion-summary";
import { AllTasksTable }   from "./AllTasksTable";
import { SlackSignalsList } from "./SlackSignalsList";

// ── 수집 상태 요약 ────────────────────────────────────────────────────────────

interface CollectionSummaryProps {
  source?: string;
  runStatus?: string;
  rawTaskCount: number;
  rawTaskDbConfigured: boolean;
  agentTaskCount?: number;
  slackSignalCount?: number;
  warningCount: number;
  errorCount: number;
  generatedBy?: string;
  createdAt?: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`} />
  );
}

function CollectionSummary({
  source,
  runStatus,
  rawTaskCount,
  rawTaskDbConfigured,
  agentTaskCount,
  slackSignalCount,
  warningCount,
  errorCount,
  generatedBy,
  createdAt,
}: CollectionSummaryProps) {
  const items: Array<{ label: string; value: React.ReactNode; alert?: boolean }> = [
    {
      label: "판단 출처",
      value: source ?? "–",
    },
    {
      label: "실행 상태",
      value: (
        <span className="flex items-center gap-1.5">
          <StatusDot ok={runStatus === "success"} />
          {runStatus ?? "–"}
        </span>
      ),
      alert: runStatus === "failed",
    },
    {
      label: "생성 방법",
      value: generatedBy ?? "–",
    },
    {
      label: "생성 시각",
      value: createdAt
        ? new Date(createdAt).toLocaleString("ko-KR", {
            month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit",
          })
        : "–",
    },
    {
      label: "Notion rawTasks",
      value: rawTaskDbConfigured
        ? `${rawTaskCount}건`
        : <span className="text-amber-600">DB 미설정</span>,
      alert: !rawTaskDbConfigured,
    },
    {
      label: "Agent 작업",
      value: agentTaskCount !== undefined ? `${agentTaskCount}건` : "–",
    },
    {
      label: "Slack 신호",
      value: slackSignalCount !== undefined ? `${slackSignalCount}건` : "–",
    },
    {
      label: "경고",
      value: warningCount > 0
        ? <span className="text-yellow-700 font-semibold">{warningCount}건</span>
        : <span className="text-gray-400">없음</span>,
    },
    {
      label: "오류",
      value: errorCount > 0
        ? <span className="text-red-700 font-semibold">{errorCount}건</span>
        : <span className="text-gray-400">없음</span>,
      alert: errorCount > 0,
    },
  ];

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        수집 상태 요약
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-gray-100">
          {items.map((item) => (
            <div
              key={item.label}
              className={`px-4 py-3 ${item.alert ? "bg-red-50" : ""}`}
            >
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                {item.label}
              </p>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 오류 패널 ─────────────────────────────────────────────────────────────────

function ErrorsPanel({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <section>
      <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
        <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2">
          ⚠ 오류 ({errors.length})
        </p>
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="text-sm text-red-800">{e}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── 경고 패널 (접힘) ──────────────────────────────────────────────────────────

function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (!warnings.length) {
    return (
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          경고 / 오류
        </h2>
        <div className="text-center py-6 text-gray-400">
          <p className="text-sm">경고/오류가 없습니다.</p>
        </div>
      </section>
    );
  }
  return (
    <section>
      <details className="rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-xs font-bold text-yellow-700 hover:bg-yellow-100 select-none list-none">
          <span className="uppercase tracking-widest">경고 ({warnings.length})</span>
          <span className="font-normal text-yellow-500">펼치기 ▾</span>
        </summary>
        <ul className="border-t border-yellow-200 px-4 py-3 space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className="text-sm text-yellow-800">{w}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ── source meta 상세 ──────────────────────────────────────────────────────────

function SourceMetaDetail({ meta }: { meta?: SourceMetaV2 }) {
  const fields: Array<{ label: string; value?: string | number }> = [
    { label: "Notion 항목 수",    value: meta?.notion_items },
    { label: "Slack 메시지 수",   value: meta?.slack_messages },
    { label: "시작 기간",         value: meta?.window_start },
    { label: "종료 기간",         value: meta?.window_end },
    { label: "수집 방식",         value: meta?.retrieval_mode },
    { label: "기본 기간 (일)",    value: meta?.default_lookback_days ?? meta?.lookback_days },
    { label: "Notion DB",        value: meta?.notion_db },
  ].filter((f) => f.value !== undefined && f.value !== "");

  const channels = meta?.slack_channels ?? [];

  return (
    <section>
      <details className="rounded-xl border border-gray-200 overflow-hidden" open>
        <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 select-none list-none uppercase tracking-widest">
          <span>수집 메타 정보</span>
          <span className="font-normal text-gray-400">접기 ▾</span>
        </summary>
        <div className="px-4 py-3 space-y-3 bg-white">
          {fields.length === 0 && !channels.length ? (
            <p className="text-xs text-gray-400">수집 메타 정보가 없습니다.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                {fields.map((f) => (
                  <div key={f.label}>
                    <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{f.label}</dt>
                    <dd className="text-sm text-gray-700 font-mono mt-0.5">{String(f.value)}</dd>
                  </div>
                ))}
              </dl>
              {channels.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                    Slack 채널 ({channels.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {channels.map((ch) => (
                      <span key={ch} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                        #{ch}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </details>
    </section>
  );
}

// ── payload debug ─────────────────────────────────────────────────────────────

function PayloadDebugPanel({ debug }: { debug?: NotionPayloadDebug }) {
  const [showPreview, setShowPreview] = useState(false);

  if (!debug) {
    return (
      <section>
        <details className="rounded-xl border border-gray-200 overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 select-none list-none uppercase tracking-widest">
            <span>Payload 디버그</span>
            <span className="font-normal text-gray-400">펼치기 ▾</span>
          </summary>
          <div className="px-4 py-3 bg-white">
            <p className="text-xs text-gray-400">payload debug 정보가 없습니다.</p>
          </div>
        </details>
      </section>
    );
  }

  const boolFields: Array<{ label: string; value: boolean }> = [
    { label: "overview",       value: debug.overview_exists },
    { label: "results",        value: debug.results_exists },
    { label: "projects",       value: debug.projects_exists },
    { label: "tasks",          value: debug.tasks_exists },
    { label: "nested payload", value: debug.payload_nested },
  ];

  const preview = debug.raw_payload_preview ?? "";
  const previewShort = preview.slice(0, 200);
  const previewLong  = preview;

  return (
    <section>
      <details className="rounded-xl border border-gray-200 overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 select-none list-none uppercase tracking-widest">
          <span>Payload 디버그</span>
          <span className="font-normal text-gray-400">펼치기 ▾</span>
        </summary>
        <div className="px-4 py-4 bg-white space-y-4">

          {/* 불리언 플래그 */}
          <div className="flex flex-wrap gap-2">
            {boolFields.map((f) => (
              <span
                key={f.label}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-semibold ${
                  f.value
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-gray-50 border-gray-200 text-gray-400"
                }`}
              >
                {f.value ? "✓" : "✗"} {f.label}
              </span>
            ))}
          </div>

          {/* 수치 */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">payload 타입</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{debug.raw_payload_property_type}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">payload 길이</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{debug.raw_payload_length}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">project_progress 수</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{debug.project_progress_count}</dd>
            </div>
            {debug.payload_nested && debug.nested_path.length > 0 && (
              <div>
                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">중첩 경로</dt>
                <dd className="font-mono text-gray-700 mt-0.5">{debug.nested_path.join(" › ")}</dd>
              </div>
            )}
          </dl>

          {/* top-level keys */}
          {debug.parsed_top_level_keys.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                파싱된 최상위 키 ({debug.parsed_top_level_keys.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {debug.parsed_top_level_keys.map((k) => (
                  <span key={k} className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* normalize warnings */}
          {debug.normalize_warnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wide mb-1">
                자동 보정 ({debug.normalize_warnings.length})
              </p>
              <ul className="space-y-0.5">
                {debug.normalize_warnings.map((w, i) => (
                  <li key={i} className="text-xs font-mono text-sky-700">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* validate error */}
          {debug.validate_error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-0.5">validate 오류</p>
              <p className="text-xs font-mono text-red-700">{debug.validate_error}</p>
            </div>
          )}

          {/* raw payload preview */}
          {preview && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">payload 미리보기</p>
              <pre className="text-xs font-mono text-gray-600 bg-gray-50 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                {showPreview ? previewLong : previewShort}
                {!showPreview && preview.length > 200 && "…"}
              </pre>
              {preview.length > 200 && (
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  {showPreview ? "접기 ▴" : "전체 보기 ▾"}
                </button>
              )}
            </div>
          )}

        </div>
      </details>
    </section>
  );
}

// ── RawDataTab ────────────────────────────────────────────────────────────────

export interface RawDataTabProps {
  // 수집 상태
  runId?: string;
  source?: string;
  runStatus?: string;
  rawTaskCount: number;
  rawTaskDbConfigured: boolean;
  agentTaskCount?: number;
  slackSignalCount?: number;
  generatedBy?: string;
  createdAt?: string;

  // Notion 작업
  rawTasks: DashboardTask[];
  rawTaskFetchError?: string;

  // Slack
  unlinkedSignals: SlackSignal[];
  allSignals?: SlackSignal[];

  // 경고/오류
  warnings?: string[];
  errors: string[];

  // 메타
  sourceMeta?: SourceMetaV2;
  payloadDebug?: NotionPayloadDebug;
  projectFallbackMode?: string;
  parseErrorRunId?: string;
  parseErrorMessage?: string;
  normalizedProjectCount?: number;
}

export function RawDataTab({
  runId,
  source,
  runStatus,
  rawTaskCount,
  rawTaskDbConfigured,
  agentTaskCount,
  slackSignalCount,
  generatedBy,
  createdAt,
  rawTasks,
  rawTaskFetchError,
  unlinkedSignals,
  allSignals = [],
  warnings = [],
  errors,
  sourceMeta,
  payloadDebug,
  projectFallbackMode,
  parseErrorRunId,
  parseErrorMessage,
  normalizedProjectCount,
}: RawDataTabProps) {

  // allSignals에서 unlinked를 제외한 "연결된" signals
  const linkedSignals = allSignals.filter((s) => !unlinkedSignals.includes(s));

  return (
    <div className="space-y-6">

      {/* 1. 수집 상태 요약 */}
      <CollectionSummary
        source={source}
        runStatus={runStatus}
        rawTaskCount={rawTaskCount}
        rawTaskDbConfigured={rawTaskDbConfigured}
        agentTaskCount={agentTaskCount}
        slackSignalCount={slackSignalCount}
        warningCount={warnings.length}
        errorCount={errors.length}
        generatedBy={generatedBy}
        createdAt={createdAt}
      />

      {/* 2. 오류 (있으면 눈에 띄게 상단 배치) */}
      {errors.length > 0 && <ErrorsPanel errors={errors} />}

      {/* 3. 경고 (접힘) */}
      <WarningsPanel warnings={warnings} />

      {/* 4. Notion rawTasks */}
      <section>
        <AllTasksTable
          tasks={rawTasks}
          fetchError={rawTaskFetchError}
          rawTaskDbConfigured={rawTaskDbConfigured}
          sectionTitle="Notion 원본 작업"
        />
      </section>

      {/* 5. Slack 신호 */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          Slack 신호
        </h2>
        {allSignals.length === 0 && unlinkedSignals.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-sm">표시할 Slack 신호가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 미연결 신호 */}
            {unlinkedSignals.length > 0 ? (
              <SlackSignalsList
                signals={unlinkedSignals}
                title="미연결 Slack 신호"
                defaultCollapsed={false}
              />
            ) : (
              <p className="text-xs text-gray-400 py-2">미연결 Slack 신호가 없습니다.</p>
            )}
            {/* 연결된 신호 (접힘) */}
            {linkedSignals.length > 0 && (
              <SlackSignalsList
                signals={linkedSignals}
                title="연결된 Slack 신호"
                defaultCollapsed
              />
            )}
          </div>
        )}
      </section>

      {/* 6. 수집 메타 정보 */}
      <SourceMetaDetail meta={sourceMeta} />

      {/* 7. 프로젝트 상세 디버그 */}
      <section>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
            프로젝트 상세 디버그
          </h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">current run_id</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{runId ?? "–"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">payload parse status</dt>
              <dd className="font-mono text-gray-700 mt-0.5">
                {parseErrorMessage
                  ? "parse_failed"
                  : payloadDebug?.repair_note
                  ? "repaired"
                  : payloadDebug
                  ? "ok"
                  : "unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">project fallback mode</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{projectFallbackMode ?? "agent"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">rawTasks count</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{rawTaskCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">normalized project count</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{normalizedProjectCount ?? "–"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">parse error run_id</dt>
              <dd className="font-mono text-gray-700 mt-0.5">{parseErrorRunId ?? "–"}</dd>
            </div>
          </dl>
          {parseErrorMessage && (
            <p className="mt-2 text-xs font-mono text-red-700 break-all">
              {parseErrorMessage}
            </p>
          )}
        </div>
      </section>

      {/* 8. Payload 디버그 */}
      <PayloadDebugPanel debug={payloadDebug} />

    </div>
  );
}
