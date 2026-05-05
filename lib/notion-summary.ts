/**
 * Notion 📊 업무현황 요약 DB에서 최신 StoredRun을 가져온다.
 *
 * @notionhq/client v5가 databases.query()를 제거했으므로
 * 표준 Notion REST API (2022-06-28)를 fetch로 직접 호출한다.
 *
 * DB 프로퍼티 매핑:
 *   이름       → Title
 *   기준일     → Date
 *   run_id     → Rich text
 *   상태       → Select: success | partial | failed
 *   payload    → Rich text ← JSON string
 *   생성시각   → Created time (built-in)
 *
 * Latest Valid Payload Fallback:
 *   최신 후보 10개를 조회해 JSON.parse 가능한 첫 번째를 사용한다.
 *   깨진 payload는 invalid_payloads 배열에 기록한다.
 */

import type { RunStatus } from "./types";
import { normalizeDashboardPayload, validateDashboardPayload } from "./normalize-dashboard-payload";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface RichTextItem {
  plain_text?: string;
}

type JsonRecord = Record<string, unknown>;

interface NotionPage {
  id: string;
  created_time: string;
  properties: Record<
    string,
    | { type: "rich_text"; rich_text: RichTextItem[] }
    | { type: "date"; date: { start: string } | null }
    | { type: "select"; select: { name: string } | null }
    | { type: "title"; title: RichTextItem[] }
    | { type: "created_time"; created_time: string }
    | { type: string }
  >;
}

export interface NotionPayloadDebug {
  run_id_hint: string;
  page_property_keys: string[];
  raw_payload_property_type: string;
  raw_payload_value_type: string;
  raw_payload_length: number;
  raw_payload_preview: string;
  parsed_top_level_keys: string[];
  normalized_top_level_keys: string[];
  overview_exists: boolean;
  results_exists: boolean;
  projects_exists: boolean;
  tasks_exists: boolean;
  payload_nested: boolean;
  nested_path: string[];
  /** normalize 단계에서 자동 수정된 항목 (빈 배열이면 수정 없음) */
  normalize_warnings: string[];
  /** validate 실패 시 에러 메시지 */
  validate_error?: string;
  /** project_progress 배열 크기 (0이면 rawTasks fallback 사용됨) */
  project_progress_count: number;
}

/** 파싱에 실패한 payload 정보 — warning 표시용 */
export interface InvalidPayloadInfo {
  page_id: string;
  run_id?: string | null;
  error: string;
}

export interface LatestRunFromNotion extends JsonRecord {
  id: string;
  created_at: string;
  date: string;
  run_id: string;
  status: RunStatus;
}

// ── 반환 타입 ─────────────────────────────────────────────────────────────────

type SuccessResult = {
  run: LatestRunFromNotion;
  payloadDebug: NotionPayloadDebug;
  invalid_payloads?: InvalidPayloadInfo[];
};

type ErrorResult = {
  error: string;
  payloadDebug?: NotionPayloadDebug;
  invalid_payloads?: InvalidPayloadInfo[];
};

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

function richTextToString(items: RichTextItem[]): string {
  return items.map((b) => b.plain_text ?? "").join("");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function toRunStatus(value: unknown): RunStatus | null {
  if (value === "success" || value === "partial" || value === "failed") {
    return value;
  }
  return null;
}

function keysOf(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "JSON 파싱 실패",
    };
  }
}

function unwrapPayload(input: unknown): {
  value: unknown;
  payloadNested: boolean;
  nestedPath: string[];
  parseError?: string;
} {
  let current = input;
  let payloadNested = false;
  const nestedPath: string[] = [];

  for (let i = 0; i < 6; i++) {
    if (typeof current === "string") {
      const text = current.trim();
      if (!text) break;
      const parsed = safeParseJson(text);
      if (!parsed.ok) {
        return {
          value: current,
          payloadNested,
          nestedPath,
          parseError: parsed.error,
        };
      }
      current = parsed.value;
      payloadNested = true;
      nestedPath.push("json_string");
      continue;
    }

    if (!isRecord(current)) break;

    if ("payload" in current) {
      current = current.payload;
      payloadNested = true;
      nestedPath.push("payload");
      continue;
    }
    if ("data" in current) {
      current = current.data;
      payloadNested = true;
      nestedPath.push("data");
      continue;
    }

    break;
  }

  return { value: current, payloadNested, nestedPath };
}

// ── 단일 페이지 처리 ──────────────────────────────────────────────────────────

type PageProcessResult =
  | { ok: true; run: LatestRunFromNotion; payloadDebug: NotionPayloadDebug; runIdHint: string }
  | { ok: false; error: string; runIdHint?: string };

function processNotionPage(page: NotionPage): PageProcessResult {
  const props = page.properties;

  // prop 타입 assertion 헬퍼
  type AsProp<T> = Extract<NotionPage["properties"][string], T>;

  // payload 추출 (기본: Rich text)
  const payloadProp = props["payload"] as NotionPage["properties"][string] | undefined;
  const rawPayloadPropertyType = payloadProp?.type ?? "missing";
  let payloadStr = "";
  let richTextChunks: RichTextItem[] = [];
  if (
    payloadProp?.type === "rich_text" &&
    "rich_text" in payloadProp &&
    Array.isArray(payloadProp.rich_text)
  ) {
    richTextChunks = payloadProp.rich_text;
    payloadStr = richTextToString(richTextChunks);
  } else if (
    payloadProp?.type === "title" &&
    "title" in payloadProp &&
    Array.isArray(payloadProp.title)
  ) {
    payloadStr = richTextToString(payloadProp.title);
  }

  // run_id 힌트 (에러 시 기록용)
  const runIdPropHint = props["run_id"] as AsProp<{ type: "rich_text" }> | undefined;
  const runIdHint =
    runIdPropHint?.type === "rich_text"
      ? richTextToString(runIdPropHint.rich_text)
      : page.id;

  const debugBase = {
    run_id_hint: runIdHint,
    page_property_keys: Object.keys(props),
    raw_payload_property_type: rawPayloadPropertyType,
    raw_payload_value_type: typeof payloadStr,
    raw_payload_length: payloadStr.length,
    raw_payload_preview: payloadStr.slice(0, 300),
  };

  if (!payloadStr.trim()) {
    return { ok: false, error: "payload is empty", runIdHint };
  }

  // chunk 구조 요약 — JSON.parse 실패 시 진단용
  const chunkSummary =
    richTextChunks.length > 0
      ? `chunks=${richTextChunks.length}[${richTextChunks.map((c) => c.plain_text?.length ?? 0).join(",")}]`
      : "chunks=0";

  // 비표준 chunk 크기 감지 (saveRunToNotion은 2000자 단위로 분할)
  const EXPECTED_CHUNK_SIZE = 2000;
  const hasOversizedChunk = richTextChunks.some(
    (c, i) =>
      i < richTextChunks.length - 1 && (c.plain_text?.length ?? 0) > EXPECTED_CHUNK_SIZE
  );

  const firstParsed = safeParseJson(payloadStr);
  if (!firstParsed.ok) {
    const errPos = firstParsed.error.match(/position (\d+)/)?.[1];
    const posContext = errPos
      ? (() => {
          const p = parseInt(errPos, 10);
          return ` — pos${errPos}:…${JSON.stringify(payloadStr.slice(Math.max(0, p - 40), p + 40))}…`;
        })()
      : "";
    const oversizeWarn = hasOversizedChunk
      ? " [WARN: oversized chunk detected — payload may have been written outside saveRunToNotion]"
      : "";
    return {
      ok: false,
      error: `JSON.parse failed: ${firstParsed.error}${posContext} — ${chunkSummary}${oversizeWarn} — preview: ${payloadStr.slice(0, 120)}`,
      runIdHint,
    };
  }

  const parsedTopLevelKeys = keysOf(firstParsed.value);
  const unwrapped = unwrapPayload(firstParsed.value);
  if (unwrapped.parseError) {
    return {
      ok: false,
      error: `nested JSON.parse failed: ${unwrapped.parseError}`,
      runIdHint,
    };
  }

  if (!isRecord(unwrapped.value)) {
    return {
      ok: false,
      error: "payload is not an object after unwrapping",
      runIdHint,
    };
  }

  const rawPayload = unwrapped.value as JsonRecord;

  // ── Normalize + Validate ──────────────────────────────────────────────────
  const { normalized: normalizedPayload, warnings: normalizeWarnings } =
    normalizeDashboardPayload(rawPayload);

  const validation = validateDashboardPayload(normalizedPayload);
  if (!validation.ok) {
    return {
      ok: false,
      error: `payload validate failed: ${validation.error}`,
      runIdHint,
    };
  }
  const validateWarnings = validation.warnings ?? [];

  const payload = normalizedPayload;
  const resultsValue = payload.results;
  const hasOverview = "overview" in payload && isRecord(payload.overview);
  const hasResults = "results" in payload;
  const hasV1Results = Array.isArray(resultsValue);

  // (validate 통과했으므로 overview도 results[]도 없는 경우는 이미 걸러짐)
  if (!hasOverview && !hasV1Results) {
    return {
      ok: false,
      error: "payload has no overview + no results array (unrecognized format)",
      runIdHint,
    };
  }

  const allNormalizeWarnings = [...normalizeWarnings, ...validateWarnings];
  const projectProgressCount = Array.isArray(payload.project_progress)
    ? (payload.project_progress as unknown[]).length
    : 0;

  const payloadDebug: NotionPayloadDebug = {
    ...debugBase,
    parsed_top_level_keys: parsedTopLevelKeys,
    normalized_top_level_keys: keysOf(payload),
    overview_exists: hasOverview,
    results_exists: hasResults,
    projects_exists: "projects" in payload,
    tasks_exists: "tasks" in payload,
    payload_nested: unwrapped.payloadNested,
    nested_path: unwrapped.nestedPath,
    normalize_warnings: allNormalizeWarnings,
    project_progress_count: projectProgressCount,
  };

  // 기준일
  const dateProp = props["기준일"] as AsProp<{ type: "date" }> | undefined;
  const payloadDate = typeof payload.date === "string" ? payload.date : undefined;
  const dateStr =
    dateProp?.type === "date" && dateProp.date?.start
      ? dateProp.date.start
      : payloadDate ?? page.created_time.slice(0, 10);

  // run_id
  const payloadRunId = typeof payload.run_id === "string" ? payload.run_id : undefined;
  const runId =
    runIdPropHint?.type === "rich_text"
      ? richTextToString(runIdPropHint.rich_text)
      : payloadRunId ?? page.id;

  // 상태
  const statusProp = props["상태"] as AsProp<{ type: "select" }> | undefined;
  const notionStatus =
    statusProp?.type === "select" && statusProp.select?.name
      ? toRunStatus(statusProp.select.name)
      : null;
  const payloadStatus = toRunStatus(payload.status);
  const status: RunStatus = notionStatus ?? payloadStatus ?? "success";

  const run: LatestRunFromNotion = {
    ...payload,
    id: page.id,
    created_at: page.created_time,
    date: dateStr,
    run_id: runId || page.id,
    status,
  };

  return {
    ok: true,
    run,
    payloadDebug: { ...payloadDebug, run_id_hint: run.run_id },
    runIdHint: run.run_id,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Notion DB에서 최신 run을 읽어 반환.
 *
 * 기본 동작 (ENABLE_LATEST_VALID_PAYLOAD_FALLBACK 미설정):
 *   - 최신 1개만 조회한다.
 *   - 파싱 실패 시 이전 valid payload로 조용히 대체하지 않는다.
 *   - ErrorResult를 반환하고 UI에서 명확한 오류를 표시한다.
 *
 * fallback 허용 (ENABLE_LATEST_VALID_PAYLOAD_FALLBACK=true):
 *   - 최신 10개를 조회해 첫 번째 valid payload를 사용한다.
 *   - 개발/디버그 환경에서만 권장.
 *
 * 반환값:
 *   { run, payloadDebug, invalid_payloads? } — 성공
 *   { error, payloadDebug?, invalid_payloads? } — 유효 payload 없음
 *   null                                        — env 미설정 / API 실패 → Supabase fallback
 */
export async function getLatestRunFromNotion(): Promise<
  SuccessResult | ErrorResult | null
> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_WORK_STATUS_SUMMARY_DATABASE_ID;
  if (!token || !dbId) return null;

  const enableFallback =
    process.env.ENABLE_LATEST_VALID_PAYLOAD_FALLBACK === "true";
  const pageSize = enableFallback ? 10 : 1;

  let res: Response;
  try {
    res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: pageSize,
        sorts: [
          { property: "기준일", direction: "descending" },
          { timestamp: "created_time", direction: "descending" },
        ],
      }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[notion-summary] fetch failed:", err);
    return null; // 네트워크 오류 → Supabase fallback
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[notion-summary] Notion API ${res.status}:`, body.slice(0, 200));
    return null; // API 오류 → Supabase fallback
  }

  const json = (await res.json()) as { results: NotionPage[] };
  if (!json.results.length) return null; // 데이터 없음 → Supabase fallback

  // ── 기본 모드: 최신 1개만 처리 ───────────────────────────────────────────

  if (!enableFallback) {
    const page = json.results[0];
    const result = processNotionPage(page);

    if (result.ok) {
      return { run: result.run, payloadDebug: result.payloadDebug };
    }

    // 최신 payload 파싱 실패 → 이전 valid로 대체하지 않고 즉시 에러 반환
    const runLabel = result.runIdHint ?? page.id;
    console.error(`[notion-summary] latest payload invalid (${runLabel}): ${result.error}`);

    return {
      error: [
        `최신 payload 파싱 실패 (run: ${runLabel})`,
        `오류: ${result.error}`,
        `조치: Agent를 다시 실행해 최신 payload를 재생성하세요.`,
      ].join("\n"),
      invalid_payloads: [
        {
          page_id: page.id,
          run_id: result.runIdHint ?? null,
          error: result.error,
        },
      ],
    };
  }

  // ── fallback 모드 (ENABLE_LATEST_VALID_PAYLOAD_FALLBACK=true) ─────────────
  // 최신 10개 중 첫 번째 valid payload 사용 — 개발/디버그 전용

  const invalidPayloads: InvalidPayloadInfo[] = [];

  for (const page of json.results) {
    const result = processNotionPage(page);

    if (result.ok) {
      return {
        run: result.run,
        payloadDebug: result.payloadDebug,
        invalid_payloads: invalidPayloads.length > 0 ? invalidPayloads : undefined,
      };
    }

    console.warn(`[notion-summary] page ${page.id} invalid: ${result.error}`);
    invalidPayloads.push({
      page_id: page.id,
      run_id: result.runIdHint ?? null,
      error: result.error,
    });
  }

  // 모든 후보 실패
  return {
    error: `최근 ${json.results.length}개 payload가 모두 파싱 불가합니다. Agent를 다시 실행해 valid payload를 생성하세요.`,
    invalid_payloads: invalidPayloads,
  };
}
