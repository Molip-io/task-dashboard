/**
 * Notion 📊 업무현황 요약 DB에서 최신 StoredRun을 가져온다.
 *
 * @notionhq/client v5 변경사항:
 *   - notion.databases.query() → notion.dataSources.query()
 *   - database_id → data_source_id
 *
 * DB 프로퍼티 매핑:
 *   이름       → Title
 *   기준일     → Date
 *   run_id     → Rich text
 *   상태       → Select: success | partial | failed
 *   payload    → Rich text  ← JSON string
 *   생성시각   → Created time (built-in)
 */

import { Client } from "@notionhq/client";
import type { StoredRun } from "./types";

function getNotionClient(): Client | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return new Client({ auth: token });
}

function richTextToString(rt: unknown): string {
  if (!Array.isArray(rt)) return "";
  return rt.map((b: { plain_text?: string }) => b.plain_text ?? "").join("");
}

/**
 * Notion 업무현황 요약 DB에서 가장 최신 페이지 1개를 읽어
 * StoredRun 형태로 반환한다.
 *
 * 반환값:
 *   { run: StoredRun }  — 성공
 *   { error: string }   — payload 파싱 실패 등 명확한 오류
 *   null                — Notion env 미설정 또는 조회 실패 (Supabase fallback 사용)
 */
export async function getLatestRunFromNotion(): Promise<
  { run: StoredRun } | { error: string } | null
> {
  const notion = getNotionClient();
  if (!notion) return null;

  const dbId = process.env.NOTION_WORK_STATUS_SUMMARY_DATABASE_ID;
  if (!dbId) return null;

  let response: Awaited<ReturnType<typeof notion.dataSources.query>>;
  try {
    // v5: dataSources.query + data_source_id
    response = await notion.dataSources.query({
      data_source_id: dbId,
      sorts: [
        { property: "기준일", direction: "descending" },
        { timestamp: "created_time", direction: "descending" },
      ],
      page_size: 1,
    });
  } catch (err) {
    console.error("[notion-summary] DB query failed:", err);
    return null; // Supabase fallback
  }

  const page = response.results[0] as
    | {
        id: string;
        created_time: string;
        properties: Record<string, unknown>;
      }
    | undefined;

  if (!page) return null; // 데이터 없음 → Supabase fallback

  const props = page.properties as Record<
    string,
    | { type: "rich_text"; rich_text: unknown }
    | { type: "date"; date: { start: string } | null }
    | { type: "select"; select: { name: string } | null }
    | { type: "title"; title: unknown }
    | { type: "created_time"; created_time: string }
    | { type: string }
  >;

  // payload 추출
  const payloadProp = props["payload"];
  let payloadStr = "";
  if (payloadProp?.type === "rich_text") {
    payloadStr = richTextToString(
      (payloadProp as { type: "rich_text"; rich_text: unknown }).rich_text
    );
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
      error: "Notion payload가 올바른 WorkStatusPayload 형식이 아닙니다 (results 필드 없음).",
    };
  }

  const payload = parsed as {
    date?: string;
    run_id?: string;
    status?: string;
    results: StoredRun["results"];
  };

  // 기준일
  const dateProp = props["기준일"];
  const dateStr =
    dateProp?.type === "date" &&
    (dateProp as { type: "date"; date: { start: string } | null }).date?.start
      ? (dateProp as { type: "date"; date: { start: string } }).date.start
      : payload.date ?? page.created_time.slice(0, 10);

  // run_id
  const runIdProp = props["run_id"];
  const runId =
    runIdProp?.type === "rich_text"
      ? richTextToString(
          (runIdProp as { type: "rich_text"; rich_text: unknown }).rich_text
        )
      : payload.run_id ?? page.id;

  // 상태
  const statusProp = props["상태"];
  const status: StoredRun["status"] =
    statusProp?.type === "select" &&
    (statusProp as { type: "select"; select: { name: string } | null }).select
      ?.name
      ? ((statusProp as { type: "select"; select: { name: string } }).select
          .name as StoredRun["status"])
      : (payload.status as StoredRun["status"]) ?? "success";

  const run: StoredRun = {
    id: page.id,
    date: dateStr,
    run_id: runId || page.id,
    status,
    results: payload.results,
    created_at: page.created_time,
  };

  return { run };
}
