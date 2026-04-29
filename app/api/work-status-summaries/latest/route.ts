import { NextResponse } from "next/server";
import { getLatestRunFromNotion } from "@/lib/notion-summary";
import { getLatestRun } from "@/lib/storage";

// Always fetch fresh
export const dynamic = "force-dynamic";

export async function GET() {
  // ── 1. Notion 우선 조회 ──────────────────────────────────────────────────
  try {
    const notionResult = await getLatestRunFromNotion();

    if (notionResult !== null) {
      // Notion에서 명확한 에러 (payload 파싱 실패 등)
      if ("error" in notionResult) {
        console.error("[GET /latest] Notion error:", notionResult.error);
        return NextResponse.json(
          { error: notionResult.error, source: "notion" },
          { status: 422 }
        );
      }
      // 성공
      return NextResponse.json({ ...notionResult.run, source: "notion" });
    }
    // notionResult === null → env 미설정 또는 Notion 조회 실패 → fallback
  } catch (err) {
    // 예상치 못한 오류는 fallback으로 넘어감
    console.error("[GET /latest] Notion unexpected error:", err);
  }

  // ── 2. Supabase fallback ──────────────────────────────────────────────────
  try {
    const run = await getLatestRun();
    if (!run) {
      return NextResponse.json({ error: "No data yet" }, { status: 404 });
    }
    return NextResponse.json({ ...run, source: "supabase" });
  } catch (err) {
    console.error("[GET /latest] Supabase error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
