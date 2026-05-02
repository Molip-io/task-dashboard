import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth";
import { saveRun } from "@/lib/storage";
import { saveRunToNotion } from "@/lib/notion-storage";
import { WorkStatusPayload, isV2Payload } from "@/lib/types";

export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // V1 또는 V2 payload 최소 검증
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("date" in payload) ||
    !("run_id" in payload)
  ) {
    return NextResponse.json(
      { error: "Missing required fields: date, run_id" },
      { status: 400 }
    );
  }

  const isV2 = isV2Payload(payload);

  // V1 전용 추가 검증
  if (!isV2 && !Array.isArray((payload as Record<string, unknown>).results)) {
    return NextResponse.json(
      { error: "Missing required fields: results (V1 payload)" },
      { status: 400 }
    );
  }

  const warnings: string[] = [];

  // ── Notion 저장 (📊 업무현황 요약 DB) ──────────────────────────────────────
  let notionResult: { ok: boolean; pageId?: string; url?: string; error?: string } | null = null;
  try {
    notionResult = await saveRunToNotion(payload);
    if (!notionResult.ok && !("skip" in notionResult && notionResult.skip)) {
      warnings.push(`Notion save failed: ${notionResult.error}`);
      console.error("[POST /api/work-status-summaries] Notion save error:", notionResult.error);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Notion save exception: ${msg}`);
    console.error("[POST /api/work-status-summaries] Notion exception:", msg);
  }

  // ── Supabase / in-memory 저장 (V1 호환) ───────────────────────────────────
  let run: { id: string; run_id: string } | null = null;
  try {
    // V2는 V1 형식으로 래핑해서 Supabase에도 저장
    const v1Payload: WorkStatusPayload = isV2
      ? {
          date: (payload as Record<string, unknown>).date as string,
          run_id: (payload as Record<string, unknown>).run_id as string,
          status: ((payload as Record<string, unknown>).status as "success" | "partial" | "failed") ?? "partial",
          results: [],
        }
      : (payload as WorkStatusPayload);

    run = await saveRun(v1Payload);
  } catch (err) {
    console.error("[POST /api/work-status-summaries]", err);
    // Notion 저장이 성공했으면 Supabase 실패는 warning 처리
    if (notionResult?.ok) {
      warnings.push(`Supabase save failed: ${err instanceof Error ? err.message : String(err)}`);
    } else {
      return NextResponse.json({ error: "Storage error" }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      id: run?.id ?? notionResult?.pageId ?? "unknown",
      run_id: (payload as Record<string, unknown>).run_id as string,
      notion_page_id: notionResult?.ok ? notionResult.pageId : undefined,
      notion_url: notionResult?.ok ? notionResult.url : undefined,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    { status: 201 }
  );
}
