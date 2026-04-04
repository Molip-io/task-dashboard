const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_API = "https://slack.com/api";

// Slack users.list 24시간 서버 캐시
let cachedUsers: Map<string, string> | null = null;
let cachedUsersExpiry = 0;
const USERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

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
  users: Map<string, string>;  // userId → display_name
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
const NOISE_KW    = ["병원", "출근이", "늦을", "늦어질", "반차", "연차", "외출", "조퇴", "개인 사정"];

function categorize(text: string): SlackCategory {
  const t = text.toLowerCase();
  if (ISSUE_KW.some((k) => t.includes(k))) return "issue";
  if (SCHEDULE_KW.some((k) => t.includes(k))) return "schedule";
  if (ACTION_KW.some((k) => t.includes(k))) return "action";
  return "update";
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
    .replace(/\*+/g, "")           // 볼드 마커 잔여 제거
    .replace(/^\[몰입\]\s*/i, "")  // [몰입] 접두사 제거
    .replace(/\s+/g, " ")
    .trim();
}

/** 주간 보고에 불필요한 노이즈 메시지 필터 */
function isNoise(text: string): boolean {
  const clean = cleanSlackText(text);
  // 개인 일정 (짧은 메시지 + 노이즈 키워드)
  if (clean.length < 100 && NOISE_KW.some((k) => clean.includes(k))) return true;
  // 스레드 제목뿐 — 15자 미만이면 내용 없음
  if (clean.length < 15) return true;
  // 단순 공지 (세팅/예약만 있고 실질 내용 없음)
  if (clean.length < 50 && /세팅|예약/.test(clean) && !/스펙|아젠다|빌드/.test(clean)) return true;
  // 질문만 있는 짧은 메시지 (보고 내용 아님)
  if (clean.length < 50 && clean.endsWith("?")) return true;
  return false;
}

/** 제목 + 본문 핵심을 결합한 한 줄 요약 */
function extractSummary(text: string): string {
  // 1) 볼드 제목 추출
  const bolds = [...text.matchAll(/\*([^*]{4,80})\*/g)].map((m) => m[1].trim());
  const title = bolds.find(
    (b) => !b.startsWith("<@") && !b.startsWith("-") && !b.startsWith("`") && b.length > 4
  );
  const cleanTitle = title ? cleanSlackText(title) : "";

  // 2) 본문에서 실질 내용 추출 (인사말/서명/멘션 스킵)
  const SKIP = ["안녕하세요", "감사합니다", "고생하셨", "참고 부탁", "확인 부탁",
    "내부리뷰 일정", "공유드립니다", "공유 드립니다", "스레드 입니다", "원분들"];
  const bodyLines = text
    .split("\n")
    .map((l) => cleanSlackText(l))           // &gt; 등 먼저 정리
    .map((l) => l.replace(/^[>\-\s]+/, "").trim())  // 인용부호/접두사 제거
    .filter(
      (l) =>
        l.length > 15 &&
        !SKIP.some((s) => l.startsWith(s)) &&
        !(cleanTitle && (l.includes(cleanTitle) || cleanTitle.includes(l)))
    );
  const body = bodyLines[0] || "";

  // 3) 결합: 제목 — 본문
  if (cleanTitle && body) {
    return `${cleanTitle} — ${body}`.slice(0, 150);
  }
  return (cleanTitle || body || cleanSlackText(text)).slice(0, 120);
}

export async function fetchSlackUsers(): Promise<Map<string, string>> {
  if (cachedUsers && Date.now() < cachedUsersExpiry) {
    return cachedUsers;
  }

  const userMap = new Map<string, string>();
  if (!SLACK_TOKEN) return userMap;

  try {
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = { limit: "200" };
      if (cursor) params.cursor = cursor;
      const data = await slackFetch("users.list", params);
      for (const member of data.members ?? []) {
        if (member.deleted || member.is_bot) continue;
        const name = member.profile?.display_name || member.profile?.real_name || member.name || "";
        if (name) userMap.set(member.id, name);
      }
      cursor = data.response_metadata?.next_cursor;
    } while (cursor);

    cachedUsers = userMap;
    cachedUsersExpiry = Date.now() + USERS_CACHE_TTL;
  } catch (e) {
    console.error("Slack users.list error:", e);
    // Return stale cache if available, otherwise empty
    if (cachedUsers) return cachedUsers;
  }

  return userMap;
}

export async function fetchSlackData(): Promise<SlackData> {
  if (!SLACK_TOKEN) return { messages: [], users: new Map(), lastUpdated: new Date().toISOString() };

  try {
    // 봇이 가입된 채널만 조회 (비공개 채널 포함)
    const { channels } = await slackFetch("users.conversations", {
      types: "public_channel,private_channel",
      limit: "50",
    });

    const oldest = String(Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60);
    const usersPromise = fetchSlackUsers();
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
          if (isNoise(msg.text)) continue;
          const summary = extractSummary(msg.text);
          if (summary.length < 5) continue;
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

    const users = await usersPromise;
    results.sort((a, b) => Number(b.ts) - Number(a.ts));
    return { messages: results.slice(0, 100), users, lastUpdated: new Date().toISOString() };
  } catch (e) {
    console.error("Slack fetch error:", e);
    return { messages: [], users: new Map(), lastUpdated: new Date().toISOString() };
  }
}
