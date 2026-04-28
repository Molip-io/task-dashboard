import { NextResponse } from "next/server";
import { getLatestRun } from "@/lib/storage";

// Always fetch fresh — in-memory fallback and ISR don't mix reliably
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const run = await getLatestRun();
    if (!run) {
      return NextResponse.json({ error: "No data yet" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    console.error("[GET /api/work-status-summaries/latest]", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
