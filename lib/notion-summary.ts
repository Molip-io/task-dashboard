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

import type { StoredRun } from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface RichTextItem {
  plain_text?: string;
}

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

function richTextToString(items: RichTextItem[]): string {
  return items.map((b) => b.plain_text ?? "").join("");
}

/**
 * Notion DB에서 가장 최신 페이지 1개를 읽어 StoredRun으로 반환.
 *
 * 반환값:
 *   { run: StoredRun }  — 성공
 *   { error: string }   — payload 파싱 실패 (명확한 오류)
 *   null                — env 미설정 / Notion 조회 실패 → Supabase fallback
 */
export async function getLatestRunFromNotion(): Promise<
  { run: StoredRun } | { error: string } | null
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

  // prop 타입 assertion 헬퍼
  type AsProp<T> = Extract<NotionPage["properties"][string], T>;

  // payload 추출 (Rich text)
  const payloadProp = props["payload"] as AsProp<{ type: "rich_text" }> | undefined;
  let payloadStr = "";
  if (payloadProp?.type === "rich_text") {
    payloadStr = richTextToString(payloadProp.rich_text);
  }

  if (!payloadStr.trim()) {
    return { error: "Notion 최신 페이지의 payload 필드가 비어 있습니다." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadStr);
  } catch {
    return {
      error: `Notion payload JSON 파싱 실패. 원문(앞 200자): ${payloadStr.slice(0, 200)}`,
    };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("results" in parsed)
  ) {
    return {
      error: "Notion payload가 올바른 형식이 아닙니다 (results 필드 없음).",
    };
  }

  const payload = parsed as {
    date?: string;
    run_id?: string;
    status?: string;
    results: StoredRun["results"];
  };

  // 기준일
  const dateProp = props["기준일"] as AsProp<{ type: "date" }> | undefined;
  const dateStr =
    dateProp?.type === "date" && dateProp.date?.start
      ? dateProp.date.start
      : payload.date ?? page.created_time.slice(0, 10);

  // run_id
  const runIdProp = props["run_id"] as AsProp<{ type: "rich_text" }> | undefined;
  const runId =
    runIdProp?.type === "rich_text"
      ? richTextToString(runIdProp.rich_text)
      : payload.run_id ?? page.id;

  // 상태
  const statusProp = props["상태"] as AsProp<{ type: "select" }> | undefined;
  const status: StoredRun["status"] =
    statusProp?.type === "select" && statusProp.select?.name
      ? (statusProp.select.name as StoredRun["status"])
      : (payload.status as StoredRun["status"]) ?? "success";

  return {
    run: {
      id: page.id,
      date: dateStr,
      run_id: runId || page.id,
      status,
      results: payload.results,
      created_at: page.created_time,
    },
  };
}
