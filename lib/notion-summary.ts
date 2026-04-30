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
 */

import type { RunStatus } from "./types";

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
}

export interface LatestRunFromNotion extends JsonRecord {
  id: string;
  created_at: string;
  date: string;
  run_id: string;
  status: RunStatus;
}

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

/**
 * Notion DB에서 가장 최신 페이지 1개를 읽어 StoredRun으로 반환.
 *
 * 반환값:
 *   { run, payloadDebug } — 성공
 *   { error: string }   — payload 파싱 실패 (명확한 오류)
 *   null                — env 미설정 / Notion 조회 실패 → Supabase fallback
 */
export async function getLatestRunFromNotion(): Promise<
  { run: LatestRunFromNotion; payloadDebug: NotionPayloadDebug }
  | { error: string; payloadDebug?: NotionPayloadDebug }
  | null
> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_WORK_STATUS_SUMMARY_DATABASE_ID;
  if (!token || !dbId) return null;

  // Notion REST API로 DB 쿼리
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
        page_size: 1,
        sorts: [
          { property: "기준일", direction: "descending" },
          { timestamp: "created_time", direction: "descending" },
        ],
      }),
      // Next.js: no-store로 항상 최신 데이터 fetch
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
  const page = json.results[0];
  if (!page) return null; // 데이터 없음 → Supabase fallback

  const props = page.properties;
  const pagePropertyKeys = Object.keys(props);

  // prop 타입 assertion 헬퍼
  type AsProp<T> = Extract<NotionPage["properties"][string], T>;

  // payload 추출 (기본: Rich text)
  const payloadProp = props["payload"] as NotionPage["properties"][string] | undefined;
  const rawPayloadPropertyType = payloadProp?.type ?? "missing";
  let payloadStr = "";
  if (
    payloadProp?.type === "rich_text" &&
    "rich_text" in payloadProp &&
    Array.isArray(payloadProp.rich_text)
  ) {
    payloadStr = richTextToString(payloadProp.rich_text);
  } else if (
    payloadProp?.type === "title" &&
    "title" in payloadProp &&
    Array.isArray(payloadProp.title)
  ) {
    payloadStr = richTextToString(payloadProp.title);
  }

  const debugBase: Omit<
    NotionPayloadDebug,
    | "parsed_top_level_keys"
    | "normalized_top_level_keys"
    | "overview_exists"
    | "results_exists"
    | "projects_exists"
    | "tasks_exists"
    | "payload_nested"
    | "nested_path"
  > = {
    run_id_hint: page.id,
    page_property_keys: pagePropertyKeys,
    raw_payload_property_type: rawPayloadPropertyType,
    raw_payload_value_type: typeof payloadStr,
    raw_payload_length: payloadStr.length,
    raw_payload_preview: payloadStr.slice(0, 300),
  };

  if (!payloadStr.trim()) {
    return {
      error: "Notion 최신 페이지의 payload 필드가 비어 있습니다.",
      payloadDebug: {
        ...debugBase,
        parsed_top_level_keys: [],
        normalized_top_level_keys: [],
        overview_exists: false,
        results_exists: false,
        projects_exists: false,
        tasks_exists: false,
        payload_nested: false,
        nested_path: [],
      },
    };
  }

  const firstParsed = safeParseJson(payloadStr);
  if (!firstParsed.ok) {
    return {
      error: `Notion payload JSON 파싱 실패: ${firstParsed.error}. 원문(앞 200자): ${payloadStr.slice(0, 200)}`,
      payloadDebug: {
        ...debugBase,
        parsed_top_level_keys: [],
        normalized_top_level_keys: [],
        overview_exists: false,
        results_exists: false,
        projects_exists: false,
        tasks_exists: false,
        payload_nested: false,
        nested_path: [],
      },
    };
  }

  const parsedTopLevelKeys = keysOf(firstParsed.value);
  const unwrapped = unwrapPayload(firstParsed.value);
  if (unwrapped.parseError) {
    return {
      error: `Notion payload nested JSON 파싱 실패: ${unwrapped.parseError}`,
      payloadDebug: {
        ...debugBase,
        parsed_top_level_keys: parsedTopLevelKeys,
        normalized_top_level_keys: keysOf(unwrapped.value),
        overview_exists: false,
        results_exists: false,
        projects_exists: false,
        tasks_exists: false,
        payload_nested: unwrapped.payloadNested,
        nested_path: unwrapped.nestedPath,
      },
    };
  }

  if (!isRecord(unwrapped.value)) {
    return {
      error: "Notion payload가 객체 형태가 아닙니다.",
      payloadDebug: {
        ...debugBase,
        parsed_top_level_keys: parsedTopLevelKeys,
        normalized_top_level_keys: keysOf(unwrapped.value),
        overview_exists: false,
        results_exists: false,
        projects_exists: false,
        tasks_exists: false,
        payload_nested: unwrapped.payloadNested,
        nested_path: unwrapped.nestedPath,
      },
    };
  }

  const payload = unwrapped.value as JsonRecord;
  const resultsValue = payload.results;
  const hasOverview =
    "overview" in payload && isRecord(payload.overview);
  const hasResults = "results" in payload;
  const hasV1Results = Array.isArray(resultsValue);

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
  };

  if (!hasOverview && !hasV1Results) {
    return {
      error: "Notion payload가 올바른 형식이 아닙니다 (overview 없음 + results 배열 아님).",
      payloadDebug,
    };
  }

  // 기준일
  const dateProp = props["기준일"] as AsProp<{ type: "date" }> | undefined;
  const payloadDate = typeof payload.date === "string" ? payload.date : undefined;
  const dateStr =
    dateProp?.type === "date" && dateProp.date?.start
      ? dateProp.date.start
      : payloadDate ?? page.created_time.slice(0, 10);

  // run_id
  const runIdProp = props["run_id"] as AsProp<{ type: "rich_text" }> | undefined;
  const payloadRunId = typeof payload.run_id === "string" ? payload.run_id : undefined;
  const runId =
    runIdProp?.type === "rich_text"
      ? richTextToString(runIdProp.rich_text)
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
    run,
    payloadDebug: {
      ...payloadDebug,
      run_id_hint: run.run_id,
    },
  };
}
