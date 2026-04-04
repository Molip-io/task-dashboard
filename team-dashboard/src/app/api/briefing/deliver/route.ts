import { fetchDashboardData } from "@/lib/notion";
import type { WorkItem } from "@/lib/notion";
import { fetchSlackData } from "@/lib/slack";
import { reconcile } from "@/lib/reconciliation";
import type { ReconciliationResult } from "@/lib/reconciliation";
import { isDone, isInProgress } from "@/lib/status";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const BRIEFING_CHANNEL = process.env.SLACK_BRIEFING_CHANNEL || "";
const MAX_RETRIES = 3;

async function postToSlack(channel: string, blocks: Record<string, unknown>[]) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, blocks }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack chat.postMessage: ${data.error}`);
  return data;
}

function buildBriefingBlocks(
  conflicts: ReconciliationResult[],
  inProgress: WorkItem[],
  done: WorkItem[],
  totalCount: number,
): Record<string, unknown>[] {
  const now = new Date();
  const blocks: Record<string, unknown>[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `📊 주간 업무 브리핑 (${now.getMonth() + 1}/${now.getDate()})`,
    },
  });

  // Summary line
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `전체 *${totalCount}*건 | 진행중 *${inProgress.length}*건 | 완료 *${done.length}*건`,
    },
  });

  // Conflicts (주의 필요)
  if (conflicts.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🚨 *주의 필요 (${conflicts.length}건)*`,
      },
    });
    for (const c of conflicts.slice(0, 5)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• <${c.item.url}|${c.item.title}> — ${c.item.assignee} · ${c.conflictReason || "불일치 감지"}`,
        },
      });
    }
    if (conflicts.length > 5) {
      blocks.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `... 외 ${conflicts.length - 5}건` },
        ],
      });
    }
  }

  // On track summary
  const onTrack =
    inProgress.length -
    conflicts.filter((c) => isInProgress(c.item.status)).length;
  if (onTrack > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *순항 중* — ${onTrack}건 정상 진행`,
      },
    });
  }

  // Done summary
  if (done.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🏁 *이번 주 완료* — ${done.length}건`,
      },
    });
  }

  // Footer
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `자동 생성됨 · <${process.env.DASHBOARD_URL || "https://dashboard.example.com"}|대시보드 바로가기>`,
      },
    ],
  });

  return blocks;
}

export async function POST(request: Request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SLACK_TOKEN || !BRIEFING_CHANNEL) {
    return Response.json(
      { error: "SLACK_BOT_TOKEN or SLACK_BRIEFING_CHANNEL not configured" },
      { status: 500 },
    );
  }

  try {
    // Fetch data
    const [notionData, slackData] = await Promise.all([
      fetchDashboardData(),
      fetchSlackData(),
    ]);

    const results = reconcile(notionData.items, slackData);

    // Build message
    const conflicts = results.filter((r) => r.conflict);
    const inProgress = notionData.items.filter((i) => isInProgress(i.status));
    const done = notionData.items.filter((i) => isDone(i.status));

    const blocks = buildBriefingBlocks(
      conflicts,
      inProgress,
      done,
      notionData.items.length,
    );

    // Post to Slack with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await postToSlack(BRIEFING_CHANNEL, blocks);
        return Response.json({
          success: true,
          conflicts: conflicts.length,
          total: notionData.items.length,
        });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.error(
          `Briefing delivery attempt ${attempt + 1} failed:`,
          lastError.message,
        );
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); // backoff
        }
      }
    }

    // All retries failed — try to notify admin via DM
    const adminUserId = process.env.SLACK_ADMIN_USER_ID;
    if (adminUserId) {
      try {
        await postToSlack(adminUserId, [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ 주간 브리핑 배달 실패 (${MAX_RETRIES}회 시도)\n오류: ${lastError?.message}`,
            },
          },
        ]);
      } catch {
        console.error("Admin DM notification also failed");
      }
    }

    return Response.json(
      { error: "Delivery failed after retries", detail: lastError?.message },
      { status: 502 },
    );
  } catch (e) {
    console.error("Briefing data fetch error:", e);
    return Response.json({ error: "Data fetch failed" }, { status: 503 });
  }
}
