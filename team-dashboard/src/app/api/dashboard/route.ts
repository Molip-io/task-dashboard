import { fetchDashboardData } from "@/lib/notion";
import { fetchSlackData } from "@/lib/slack";
import { reconcile } from "@/lib/reconciliation";
import { detectBottlenecks } from "@/lib/bottlenecks";

export const revalidate = 60;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const result = await promise;
    clearTimeout(timeout);
    return result;
  } catch (e) {
    clearTimeout(timeout);
    throw new Error(`${label} timeout/error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function GET() {
  const warnings: string[] = [];
  let notionData;
  let slackData;

  // Notion fetch (required)
  try {
    notionData = await withTimeout(fetchDashboardData(), 10_000, "Notion");
  } catch (e) {
    console.error("Notion API error:", e);
    return Response.json(
      { error: "Notion 데이터 조회 실패" },
      { status: 503 }
    );
  }

  // Slack fetch (optional — graceful degradation)
  try {
    slackData = await withTimeout(fetchSlackData(), 10_000, "Slack");
  } catch (e) {
    console.error("Slack API error (degraded mode):", e);
    warnings.push("슬랙 연결 실패 — 노션 데이터만 표시 중");
  }

  // Run reconciliation (only if we have both sources)
  const reconciliation = slackData
    ? reconcile(notionData.items, slackData)
    : [];
  const alerts = detectBottlenecks(notionData.items, slackData?.messages || []);

  return Response.json({
    ...notionData,
    slack: slackData ?? null,
    reconciliation,
    warnings,
    alerts,
  });
}
