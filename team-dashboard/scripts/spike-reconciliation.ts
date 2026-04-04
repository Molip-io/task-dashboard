/**
 * Spike: Reconciliation 정확도 검증
 *
 * 사용법:
 *   npx tsx scripts/spike-reconciliation.ts
 *
 * 필요 환경변수:
 *   NOTION_TOKEN, NOTION_DATABASE_IDS, SLACK_BOT_TOKEN
 */

// Load env
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamic imports to pick up env vars
  const { fetchDashboardData } = await import("../src/lib/notion");
  const { fetchSlackData } = await import("../src/lib/slack");
  const { reconcile } = await import("../src/lib/reconciliation");

  console.log("=== Spike: Reconciliation 검증 ===\n");

  // Check env
  if (!process.env.NOTION_TOKEN) {
    console.error("❌ NOTION_TOKEN not set. Add to .env.local");
    process.exit(1);
  }
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn("⚠️  SLACK_BOT_TOKEN not set — Slack data will be empty\n");
  }

  // Fetch
  console.log("📡 Fetching Notion data...");
  const notionData = await fetchDashboardData();
  console.log(`   → ${notionData.items.length} items, ${notionData.projects.length} projects\n`);

  console.log("📡 Fetching Slack data...");
  const slackData = await fetchSlackData();
  console.log(`   → ${slackData.messages.length} messages, ${slackData.users.size} users\n`);

  // Reconcile
  console.log("🔍 Running reconciliation...\n");
  const results = reconcile(notionData.items, slackData);

  const conflicts = results.filter((r) => r.conflict);
  const highConf = conflicts.filter((r) => r.confidence === "high");
  const medConf = conflicts.filter((r) => r.confidence === "medium");
  const lowConf = conflicts.filter((r) => r.confidence === "low");

  // Report
  console.log("=== 결과 ===");
  console.log(`전체 항목: ${results.length}`);
  console.log(`불일치 감지: ${conflicts.length} (high: ${highConf.length}, medium: ${medConf.length}, low: ${lowConf.length})`);
  console.log("");

  if (conflicts.length > 0) {
    console.log("--- 감지된 불일치 ---");
    for (const c of conflicts) {
      console.log(`  [${c.confidence}] ${c.item.project} / ${c.item.title}`);
      console.log(`         담당자: ${c.item.assignee} | 상태: ${c.item.status}`);
      console.log(`         사유: ${c.conflictReason}`);
      if (c.slackSignals.length > 0) {
        console.log(`         슬랙 신호: ${c.slackSignals[0].summary.slice(0, 80)}`);
      }
      console.log("");
    }
  }

  // Go/No-Go
  console.log("=== Go/No-Go 판정 ===");
  if (conflicts.length >= 3 && highConf.length >= 1) {
    console.log("✅ GO — 3건 이상 감지, high confidence 1건 이상. 방향 확정.");
  } else if (conflicts.length >= 1) {
    console.log("⚠️  CONDITIONAL — 감지됨, 정확도 수동 확인 필요.");
  } else {
    console.log("❌ NO-GO — 0건 감지. 매칭 로직 재검토 필요.");
    if (slackData.messages.length === 0) {
      console.log("   (슬랙 메시지가 0건 — SLACK_BOT_TOKEN 확인)");
    }
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
