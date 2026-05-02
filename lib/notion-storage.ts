/**
 * 📊 업무현황 요약 DB에 새 page를 생성하는 저장 로직
 *
 * 환경변수 우선순위:
 *   1. NOTION_SUMMARY_DATA_SOURCE_ID  — data source parent (신규 Notion workspace)
 *   2. NOTION_SUMMARY_DATABASE_ID     — database_id parent (구형 SDK / 클래식 workspace)
 *   3. NOTION_WORK_STATUS_SUMMARY_DATABASE_ID — 기존 env var 이름 fallback
 *
 * rich_text는 Notion 2000자 제한에 맞춰 청크 분할합니다.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const RICH_TEXT_CHUNK_SIZE = 2000;

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

export function maskId(id?: string): string {
  if (!id) return "missing";
  return `${id.slice(0, 8)}...${id.slice(-6)} len=${id.length}`;
}

function chunkRichText(text: string): Array<{ text: { content: string } }> {
  const chunks: Array<{ text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_CHUNK_SIZE) {
    chunks.push({ text: { content: text.slice(i, i + RICH_TEXT_CHUNK_SIZE) } });
  }
  return chunks.length ? chunks : [{ text: { content: "" } }];
}

// ── parent 빌더 ───────────────────────────────────────────────────────────────

type NotionParent =
  | { data_source_id: string }
  | { database_id: string };

export function buildSummaryParent(): NotionParent {
  const dataSourceId = (
    process.env.NOTION_SUMMARY_DATA_SOURCE_ID ?? ""
  ).trim();
  if (dataSourceId) {
    return { data_source_id: dataSourceId };
  }

  const databaseId = (
    process.env.NOTION_SUMMARY_DATABASE_ID ??
    process.env.NOTION_WORK_STATUS_SUMMARY_DATABASE_ID ??
    ""
  ).trim();
  if (databaseId) {
    return { database_id: databaseId };
  }

  throw new Error(
    "Missing NOTION_SUMMARY_DATA_SOURCE_ID or NOTION_SUMMARY_DATABASE_ID"
  );
}

// ── Hard Gate 검증 ────────────────────────────────────────────────────────────

export interface HardGateError {
  gate: string;
  message: string;
}

export function hardGateValidate(payloadString: string): void {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payloadString) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Hard Gate failed: payloadString is not valid JSON — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!parsed.overview) {
    throw new Error("Hard Gate failed: missing overview");
  }

  // V2 payload: project_progress 배열 필수 (V1 results 도 허용)
  const hasProjectProgress =
    Array.isArray(parsed.project_progress) && parsed.project_progress.length > 0;
  const hasResults = Array.isArray(parsed.results);

  if (!hasProjectProgress && !hasResults) {
    throw new Error(
      "Hard Gate failed: project_progress is empty and results is missing"
    );
  }

  // payload_version / schema_version — 존재할 때만 체크 (강제 버전 잠금)
  if (
    parsed.payload_version !== undefined &&
    parsed.payload_version !== "2.4.1"
  ) {
    throw new Error(
      `Hard Gate failed: payload_version must be "2.4.1", got "${parsed.payload_version}"`
    );
  }

  if (
    parsed.schema_version !== undefined &&
    parsed.schema_version !== "molip-dashboard-v2"
  ) {
    throw new Error(
      `Hard Gate failed: schema_version mismatch, got "${parsed.schema_version}"`
    );
  }
}

// ── source_meta 정제 ──────────────────────────────────────────────────────────

const FIXED_SOURCE_META = {
  project_config_db: "🗃️ 프로젝트 리스트",
  project_config_access: "name_first_url_fallback",
  project_config_url:
    "https://www.notion.so/27eb4a4650038016a5fef8ce4bff328c?v=27eb4a465003809599ec000c27d45503",
  project_config_fields: ["이름", "요약", "채널명", "키워드", "조회 기간"],
  notion_task_db: "😃 팀 작업 현황",
  summary_db: "📊 업무현황 요약",
} as const;

function sanitizeSourceMeta(
  sourceMeta: unknown
): Record<string, unknown> {
  const base = FIXED_SOURCE_META as Record<string, unknown>;
  if (!sourceMeta || typeof sourceMeta !== "object") return base;
  const sm = sourceMeta as Record<string, unknown>;

  // project_config_url: "@..." 패턴은 버리고 고정값 사용
  const url = typeof sm.project_config_url === "string" &&
    sm.project_config_url.startsWith("http")
    ? sm.project_config_url
    : FIXED_SOURCE_META.project_config_url;

  // project_config_fields: 문자열 배열 검증
  const fields =
    Array.isArray(sm.project_config_fields) &&
    sm.project_config_fields.every((f) => typeof f === "string")
      ? sm.project_config_fields
      : FIXED_SOURCE_META.project_config_fields;

  return { ...base, ...sm, project_config_url: url, project_config_fields: fields };
}

// ── Notion 저장 결과 타입 ─────────────────────────────────────────────────────

export type NotionSaveResult =
  | { ok: true; pageId: string; url: string; mode: "data_source_id" | "database_id" }
  | { ok: false; error: string; skip?: boolean };

// ── 메인 저장 함수 ────────────────────────────────────────────────────────────

/**
 * 📊 업무현황 요약 DB에 새 page를 생성한다.
 *
 * @param rawPayload — V2 payload 객체 또는 JSON 문자열
 * @returns NotionSaveResult
 */
export async function saveRunToNotion(
  rawPayload: unknown
): Promise<NotionSaveResult> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return { ok: false, error: "NOTION_TOKEN not set", skip: true };
  }

  // parent 빌드 + 로그
  let parent: NotionParent;
  try {
    parent = buildSummaryParent();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      skip: true,
    };
  }

  const mode: "data_source_id" | "database_id" =
    "data_source_id" in parent ? "data_source_id" : "database_id";

  console.info("[summary save parent]", {
    mode,
    summaryDataSourceId: maskId(process.env.NOTION_SUMMARY_DATA_SOURCE_ID),
    summaryDatabaseId: maskId(
      process.env.NOTION_SUMMARY_DATABASE_ID ??
      process.env.NOTION_WORK_STATUS_SUMMARY_DATABASE_ID
    ),
  });

  // 직렬화
  const payloadString =
    typeof rawPayload === "string"
      ? rawPayload
      : JSON.stringify(rawPayload);

  // Hard Gate
  try {
    hardGateValidate(payloadString);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 페이로드 파싱 (Hard Gate 통과 후)
  const p = JSON.parse(payloadString) as Record<string, unknown>;

  const date =
    typeof p.date === "string" ? p.date : new Date().toISOString().slice(0, 10);
  const runId =
    typeof p.run_id === "string" ? p.run_id : crypto.randomUUID();
  const status =
    p.status === "success" || p.status === "partial" || p.status === "failed"
      ? (p.status as string)
      : "partial";

  const overview =
    p.overview && typeof p.overview === "object"
      ? (p.overview as Record<string, unknown>)
      : {};
  const overallStatus =
    typeof overview.overall_status === "string"
      ? overview.overall_status
      : status;
  const overallSummary =
    typeof overview.summary === "string" ? overview.summary : "";

  const projectCount = Array.isArray(p.project_progress)
    ? p.project_progress.length
    : Array.isArray(p.projects)
    ? (p.projects as unknown[]).length
    : 0;
  const teamCount = Array.isArray(p.teams) ? (p.teams as unknown[]).length : 0;

  // source_meta 정제 → payload에 반영
  const sanitized = { ...p, source_meta: sanitizeSourceMeta(p.source_meta) };
  const finalPayloadString = JSON.stringify(sanitized);

  // Notion page 생성
  const body = {
    parent,
    properties: {
      이름: {
        title: [{ text: { content: `${date} 업무현황 요약` } }],
      },
      기준일: {
        date: { start: date },
      },
      run_id: {
        rich_text: [{ text: { content: runId } }],
      },
      상태: {
        select: { name: status },
      },
      생성_방식: {
        select: { name: "agent" },
      },
      요약_대상_수: {
        number: projectCount,
      },
      프로젝트_수: {
        number: projectCount,
      },
      팀_수: {
        number: teamCount,
      },
      전체_상태: {
        select: { name: overallStatus },
      },
      전체_요약: {
        rich_text: [
          { text: { content: overallSummary.slice(0, 2000) } },
        ],
      },
      payload: {
        rich_text: chunkRichText(finalPayloadString),
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Notion fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      const errJson = JSON.parse(text) as Record<string, unknown>;
      detail = `${errJson.code ?? res.status}: ${errJson.message ?? text.slice(0, 200)}`;
    } catch {
      // raw text
    }
    console.error("[notion-storage] create page failed", {
      status: res.status,
      mode,
      detail,
    });
    return { ok: false, error: `Notion API ${res.status} — ${detail}` };
  }

  const created = (await res.json()) as { id?: string; url?: string };
  const pageId = created.id ?? "";
  const pageUrl = created.url ?? `https://notion.so/${pageId.replace(/-/g, "")}`;

  console.info("[notion-storage] page created", {
    pageId,
    pageUrl,
    mode,
    date,
    runId,
    payloadLen: finalPayloadString.length,
  });

  return { ok: true, pageId, url: pageUrl, mode };
}
