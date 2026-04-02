const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_API = "https://slack.com/api";

export interface SlackMessage {
  ts: string;
  text: string;
  userId: string;
  channel: string;
  channelName: string;
  isDecision: boolean;
  isAction: boolean;
  isBlocker: boolean;
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

const DECISION_KW = ["결정", "확정", "결론", "합의", "승인", "결정됨"];
const ACTION_KW   = ["해주세요", "부탁", "처리", "담당", "액션", "할일", "해야"];
const BLOCKER_KW  = ["블로커", "막혔", "문제", "지연", "안됨", "불가", "이슈"];

function classify(text: string) {
  const t = text.toLowerCase();
  return {
    isDecision: DECISION_KW.some((k) => t.includes(k)),
    isAction:   ACTION_KW.some((k) => t.includes(k)),
    isBlocker:  BLOCKER_KW.some((k) => t.includes(k)),
  };
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
          const { isDecision, isAction, isBlocker } = classify(msg.text);
          results.push({
            ts: msg.ts,
            text: msg.text.slice(0, 300),
            userId: msg.user ?? "",
            channel: ch.id,
            channelName: ch.name,
            isDecision,
            isAction,
            isBlocker,
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
