/**
 * Fix corrupted payload run 2026-05-04-0903 and save a corrected new run.
 *
 * The corruption: Notion auto-linked project_config_url in source_meta
 * (including surrounding JSON text) to a page mention. When read back,
 * the mention's plain_text replaces the URL and the surrounding JSON text
 * is lost, causing a JSON.parse failure at position 14692.
 *
 * Fix: reconstruct the valid payload by repairing the source_meta section,
 * then call saveRunToNotion() which will sanitize source_meta and store
 * via chunkRichText (plain text, no auto-linking).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Read raw payload ──────────────────────────────────────────────────────────

const rawPayload = readFileSync(join(__dir, "payload-raw.txt"), "utf8");
console.log("Raw payload length:", rawPayload.length);

// Verify the corruption
try {
  JSON.parse(rawPayload);
  console.log("⚠️  Payload already parses — no corruption to fix?");
} catch (err) {
  console.log("❌ Confirmed corruption:", err.message);
}

// ── Fix the corruption ────────────────────────────────────────────────────────
//
// The corrupted section is:
//   "project_config_url":"프로젝트 리스트 기간"]
//
// The original source_meta had:
//   "project_config_url":"https://www.notion.so/27eb4a4650038016a5fef8ce4bff328c?v=...","project_config_fields":["이름","요약","채널명","키워드","조회 기간"]
//
// Notion auto-linked the URL (plus surrounding JSON text up to the space
// before "기간") to a page mention "프로젝트 리스트", swallowing:
//   https://www.notion.so/27eb4a4650038016a5fef8ce4bff328c?v=27eb4a465003809599ec000c27d45503","project_config_fields":["이름","요약","채널명","키워드","조회
//
// sanitizeSourceMeta() in saveRunToNotion() rebuilds source_meta fields
// from FIXED_SOURCE_META, so we just need valid JSON to feed into it.
// We replace the corrupted value + stray ] with a placeholder URL.

const CORRUPTED = '"project_config_url":"프로젝트 리스트 기간"]';
const REPLACEMENT = '"project_config_url":"https://www.notion.so/27eb4a4650038016a5fef8ce4bff328c?v=27eb4a465003809599ec000c27d45503","project_config_fields":["이름","요약","채널명","키워드","조회 기간"]';

if (!rawPayload.includes(CORRUPTED.slice(0, 30))) {
  console.error("Could not find corrupted section. Checking raw...");
  const pos = 14680;
  console.log("Raw chars at 14680-14720:", JSON.stringify(rawPayload.slice(14680, 14720)));
  process.exit(1);
}

let fixed = rawPayload.replace(CORRUPTED, REPLACEMENT);

// Also fix payload_version: "2026-05-04" → "2.4.1"
fixed = fixed.replace('"payload_version":"2026-05-04"', '"payload_version":"2.4.1"');

// Fix results: {"version":"2026-05-04"} → remove it (v2 payload doesn't need results)
// But we need to keep valid JSON. Let's just set results to [] since saveRunToNotion handles it.
// Actually, results as object is now allowed by validateDashboardPayload (v2).
// Let's leave it and just fix the version + source_meta corruption.

// Test parse
let parsed;
try {
  parsed = JSON.parse(fixed);
  console.log("\n✅ Fixed payload parses successfully!");
  console.log("payload_version:", parsed.payload_version);
  console.log("schema_version:", parsed.schema_version);
  console.log("run_id:", parsed.run_id);
  console.log("date:", parsed.date);
  console.log("overview exists:", !!parsed.overview);
  console.log("project_progress count:", Array.isArray(parsed.project_progress) ? parsed.project_progress.length : "not array");
  console.log("source_meta.project_config_url:", parsed.source_meta?.project_config_url);
  console.log("source_meta.project_config_fields:", parsed.source_meta?.project_config_fields);
} catch (err) {
  console.error("\n❌ Fixed payload still fails to parse:", err.message);
  const match = err.message.match(/position (\d+)/);
  if (match) {
    const pos = parseInt(match[1]);
    console.log("Context:", JSON.stringify(fixed.slice(Math.max(0, pos - 50), pos + 50)));
  }
  process.exit(1);
}

// ── Save corrected run via Notion API ─────────────────────────────────────────

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) { console.error("NOTION_TOKEN 환경변수를 설정해주세요."); process.exit(1); }
const NOTION_DB_ID = "351b4a46-5003-80ff-8b85-f772cb93da32";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const RICH_TEXT_CHUNK_SIZE = 2000;

function chunkRichText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_CHUNK_SIZE) {
    chunks.push({ text: { content: text.slice(i, i + RICH_TEXT_CHUNK_SIZE) } });
  }
  return chunks.length ? chunks : [{ text: { content: "" } }];
}

const FIXED_SOURCE_META = {
  project_config_db: "🗃️ 프로젝트 리스트",
  project_config_access: "name_first_url_fallback",
  project_config_url: "27eb4a4650038016a5fef8ce4bff328c",  // store ID only, not full URL (prevents Notion auto-linking)
  project_config_fields: ["이름", "요약", "채널명", "키워드", "조회 기간"],
  notion_task_db: "😃 팀 작업 현황",
  summary_db: "📊 업무현황 요약",
};

function sanitizeSourceMeta(sm) {
  const base = { ...FIXED_SOURCE_META };
  if (!sm || typeof sm !== "object") return base;
  // Merge: base fields + agent's dynamic fields, with fixed overrides for sensitive fields
  return {
    ...base,
    ...sm,
    project_config_url: FIXED_SOURCE_META.project_config_url,  // always use ID, not URL
    project_config_fields: Array.isArray(sm.project_config_fields) && sm.project_config_fields.every(f => typeof f === "string")
      ? sm.project_config_fields
      : FIXED_SOURCE_META.project_config_fields,
  };
}

// Prepare final payload
const sanitized = { ...parsed, source_meta: sanitizeSourceMeta(parsed.source_meta) };
const finalPayloadString = JSON.stringify(sanitized);
console.log("\nFinal payload length:", finalPayloadString.length);
console.log("Payload version:", sanitized.payload_version);
console.log("source_meta.project_config_url in final:", sanitized.source_meta.project_config_url);

// Build Notion page body
const p = sanitized;
const date = typeof p.date === "string" ? p.date : new Date().toISOString().slice(0, 10);
const runId = "2026-05-04-0903-fixed";  // new run ID to distinguish
const status = p.status === "success" || p.status === "partial" || p.status === "failed" ? p.status : "partial";
const overview = p.overview && typeof p.overview === "object" ? p.overview : {};
const overallStatus = typeof overview.overall_status === "string" ? overview.overall_status : status;
const overallSummary = typeof overview.summary === "string" ? overview.summary : "";
const projectCount = Array.isArray(p.project_progress) ? p.project_progress.length : 0;
const teamCount = Array.isArray(p.teams) ? p.teams.length : 0;

console.log("\nSaving to Notion:");
console.log("  date:", date);
console.log("  run_id:", runId);
console.log("  status:", status);
console.log("  projectCount:", projectCount);

const body = {
  parent: { database_id: NOTION_DB_ID },
  properties: {
    이름: { title: [{ text: { content: `${date} 업무현황 요약 (corrected)` } }] },
    기준일: { date: { start: date } },
    run_id: { rich_text: [{ text: { content: runId } }] },
    상태: { select: { name: status } },
    생성_방식: { select: { name: "agent" } },
    요약_대상_수: { number: projectCount },
    프로젝트_수: { number: projectCount },
    팀_수: { number: teamCount },
    전체_상태: { select: { name: overallStatus } },
    전체_요약: { rich_text: [{ text: { content: overallSummary.slice(0, 2000) } }] },
    payload: { rich_text: chunkRichText(finalPayloadString) },
  },
};

console.log("\nChunk count for payload:", chunkRichText(finalPayloadString).length);

const res = await fetch(`${NOTION_API}/pages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error("\n❌ Notion API error:", res.status, text.slice(0, 400));
  process.exit(1);
}

const created = await res.json();
console.log("\n✅ New page created successfully!");
console.log("Page ID:", created.id);
console.log("URL:", created.url ?? `https://notion.so/${(created.id ?? "").replace(/-/g, "")}`);

// Verify: read back and parse the payload
console.log("\n── Verifying stored payload ──────────────────────────────────────");
const verifyRes = await fetch(`${NOTION_API}/pages/${created.id}`, {
  headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
});
const verifyPage = await verifyRes.json();
const richText = verifyPage.properties?.payload?.rich_text ?? [];
console.log("Chunk count:", richText.length);
const storedPayload = richText.map(b => b.plain_text ?? "").join("");
console.log("Stored payload length:", storedPayload.length);

try {
  const storedParsed = JSON.parse(storedPayload);
  console.log("✅ Stored payload parses successfully!");
  console.log("payload_version:", storedParsed.payload_version);
  console.log("run_id:", storedParsed.run_id);
  console.log("project_progress count:", Array.isArray(storedParsed.project_progress) ? storedParsed.project_progress.length : "?");
  console.log("source_meta.project_config_url:", storedParsed.source_meta?.project_config_url);
} catch (err) {
  console.error("❌ Stored payload fails to parse:", err.message);
  const match = err.message.match(/position (\d+)/);
  if (match) {
    const pos = parseInt(match[1]);
    console.log("Context:", JSON.stringify(storedPayload.slice(Math.max(0, pos - 60), pos + 60)));
  }
}
