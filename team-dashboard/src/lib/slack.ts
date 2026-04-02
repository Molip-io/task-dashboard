const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_API = "https://slack.com/api";

export type SlackCategory = "schedule" | "action" | "issue" | "update";

export interface SlackMessage {
  ts: string;
  text: string;
  summary: string;
  userId: string;
  channel: string;
  channelName: string;
  category: SlackCategory;
}

export interface SlackData {
  messages: SlackMessage[];
  lastUpdated: string;
}

async function slackFetch(method: string, params: Record<string, string> = {}) {
  const url = new URL(`${SLACK_API}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
    next: { revalidate: 60 },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

const SCHEDULE_KW = ["일정", "회의", "미팅", "리뷰", "시간", "장소", "아젠다", "세팅"];
const ACTION_KW   = ["해주세요", "부탁드", "수정 부탁", "확인해주", "처리", "공유 부탁", "준비 부탁", "전달 부탁"];
const ISSUE_KW    = ["블로커", "막혔", "지연", "안됨", "불가", "이슈", "버그", "크래시", "에러", "문제"];

function categorize(text: string): SlackCategory {
  const t = text.toLowerCase();
  if (ISSUE_KW.some((k) => t.includes(k))) return "issue";
  if (SCHEDULE_KW.some((k) => t.includes(k))) return "schedule";
  if (ACTION_KW.some((k) => t.includes(k))) return "action";
  return "update";
}

/** Slack 마크업에서 핵심 한 줄 요약 추출 */
function extractSummary(text: string): string {
  // 볼드 텍스트(*...*) 중 제목성 텍스트 추출
  const bolds = [...text.matchAll(/\*([^*]{4,80})\*/g)].map((m) => m[1].trim());
  const title = bolds.find((b) => !b.startsWith("<@") && !b.startsWith("-") && b.length > 4);
  if (title) {
    return cleanSlackText(title).slice(0, 120);
  }
  // 볼드 없으면 첫 의미 있는 줄
  const lines = text.split("\n").map((l) => l.replace(/^[>\-\s*]+/, "").trim()).filter((l) => l.length > 4);
  return cleanSlackText(lines[0] || text).slice(0, 120);
}

function cleanSlackText(t: string): string {
  return t
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/<!subteam\^[A-Z0-9]+>/g, "")
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/:[a-z_\-+0-9]+:/g, "")
    .replace(/&gt;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSlackData(): Promise<SlackData> {
  if (!SLACK_TOKEN) return { messages: [], lastUpdated: new Date().toISOString() };

  try {
    // 봇이 가입된 채널만 조회 (비공개 채널 포함)
    const { channels } = await slackFetch("users.conversations", {
      types: "public_channel,private_channel",
      limit: "50",
    });

    const oldest = String(Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60);
    const results: SlackMessage[] = [];

    await Promise.allSettled(
      (channels as { id: string; name: string }[]).map(async (ch) => {
        const { messages } = await slackFetch("conversations.history", {
          channel: ch.id,
          oldest,
          limit: "100",
        });
        for (const msg of messages as { ts: string; text: string; user?: string; subtype?: string }[]) {
          if (!msg.text || msg.subtype) continue;
          const summary = extractSummary(msg.text);
          if (summary.length < 5) continue; // 의미 없는 메시지 스킵
          results.push({
            ts: msg.ts,
            text: msg.text.slice(0, 300),
            summary,
            userId: msg.user ?? "",
            channel: ch.id,
            channelName: ch.name,
            category: categorize(msg.text),
          });
        }
      })
    );

    results.sort((a, b) => Number(b.ts) - Number(a.ts));
    return { messages: results.slice(0, 100), lastUpdated: new Date().toISOString() };
  } catch (e) {
    console.error("Slack fetch error:", e);
    return { messages: [], lastUpdated: new Date().toISOString() };
  }
}
