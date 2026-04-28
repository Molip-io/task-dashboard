import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth";
import { saveRun } from "@/lib/storage";
import { WorkStatusPayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WorkStatusPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.date || !payload.run_id || !Array.isArray(payload.results)) {
    return NextResponse.json({ error: "Missing required fields: date, run_id, results" }, { status: 400 });
  }

  try {
    const run = await saveRun(payload);
    return NextResponse.json({ ok: true, id: run.id, run_id: run.run_id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/work-status-summaries]", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
