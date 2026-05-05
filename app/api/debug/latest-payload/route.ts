import { NextResponse } from "next/server";
import { getLatestRunFromNotion } from "@/lib/notion-summary";
import { isV2Payload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const notionResult = await getLatestRunFromNotion();

  if (notionResult === null) {
    return NextResponse.json({ ok: false, error: "Notion env not configured or API failed" }, { status: 503 });
  }

  if ("error" in notionResult) {
    const debug = notionResult.payloadDebug;
    const errMsg = notionResult.error ?? "unknown error";
    const posMatch = errMsg.match(/position (\d+)/);
    const pos = posMatch ? parseInt(posMatch[1], 10) : null;

    const preview = debug?.raw_payload_preview ?? "";
    const previewLen = debug?.raw_payload_length ?? 0;
    const contextSnippet =
      pos !== null && previewLen > 0
        ? (() => {
            // raw_payload_preview는 300자 — position이 300자 이내면 context 추출 가능
            const start = Math.max(0, pos - 250);
            const end = Math.min(preview.length, pos + 250);
            return pos < preview.length ? preview.slice(start, end) : null;
          })()
        : null;

    return NextResponse.json(
      {
        ok: false,
        run_id: debug?.run_id_hint ?? null,
        page_id: debug?.page_id ?? null,
        payload_length: previewLen,
        error: errMsg,
        position: pos,
        context: contextSnippet,
        preview_start: preview.slice(0, 100) || null,
        preview_end: null,
        chunk_count: debug?.chunk_count ?? null,
        invalid_payloads: notionResult.invalid_payloads ?? [],
      },
      { status: 422 }
    );
  }

  const run = notionResult.run;
  const debug = notionResult.payloadDebug;
  const payload = run as Record<string, unknown>;
  const isV2 = isV2Payload(payload);

  return NextResponse.json({
    ok: true,
    run_id: typeof payload.run_id === "string" ? payload.run_id : null,
    page_id: debug.page_id ?? null,
    payload_length: debug.raw_payload_length,
    payload_version: typeof payload.payload_version === "string" ? payload.payload_version : null,
    schema_version: typeof payload.schema_version === "string" ? payload.schema_version : null,
    is_v2: isV2,
    project_progress_count: debug.project_progress_count,
    confirmation_queue_count: Array.isArray(payload.confirmation_queue)
      ? (payload.confirmation_queue as unknown[]).length
      : null,
    repair_note: debug.repair_note ?? null,
    normalize_warnings: debug.normalize_warnings,
    chunk_count: debug.chunk_count ?? null,
  });
}
