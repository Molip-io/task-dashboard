/**
 * debug-payload-read.mjs
 * run: molip-ops-brief-2026-05-05-kst-142533 payload 분석
 *
 * 실행: node scripts/debug-payload-read.mjs
 */

import fs from "fs";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_SUMMARY_DB_ID ?? "351b4a46-5003-80ff-8b85-f772cb93da32";
const TARGET_RUN_ID = process.env.TARGET_RUN_ID ?? "molip-ops-brief-2026-05-05-kst-142533";

if (!TOKEN) {
  console.error("NOTION_TOKEN 환경변수를 설정해주세요.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};

function richTextToString(items) {
  return items.map((b) => b.plain_text ?? "").join("");
}

// ── 1. databases/query 방식 (현재 대시보드 방식) ──────────────────────────────

async function readViaDbQuery() {
  console.log("\n=== [1] databases/query 방식 (현재 대시보드 방식) ===");

  const res = await fetch(`${NOTION_API}/databases/${DB_ID}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      page_size: 10,
      sorts: [
        { property: "기준일", direction: "descending" },
        { timestamp: "created_time", direction: "descending" },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DB query failed ${res.status}: ${t.slice(0, 200)}`);
  }

  const json = await res.json();
  console.log(`  결과 페이지 수: ${json.results.length}`);

  // run_id가 일치하는 페이지 찾기
  let targetPage = null;
  for (const page of json.results) {
    const runIdProp = page.properties["run_id"];
    const runId =
      runIdProp?.type === "rich_text"
        ? richTextToString(runIdProp.rich_text)
        : null;
    console.log(`  페이지 ${page.id.slice(0, 8)}... run_id=${runId}`);
    if (runId === TARGET_RUN_ID) {
      targetPage = page;
    }
  }

  if (!targetPage) {
    console.log(`  ⚠ run_id=${TARGET_RUN_ID} 페이지를 최근 10개에서 찾지 못함`);
    console.log("  → 가장 최신 페이지 사용");
    targetPage = json.results[0];
  }

  const payloadProp = targetPage.properties["payload"];
  if (!payloadProp || payloadProp.type !== "rich_text") {
    throw new Error(`payload 프로퍼티 타입이 예상과 다름: ${payloadProp?.type}`);
  }

  const chunks = payloadProp.rich_text;
  const payloadStr = richTextToString(chunks);

  console.log(`  chunk 개수: ${chunks.length}`);
  chunks.forEach((c, i) => {
    console.log(`    chunk[${i}]: len=${c.plain_text?.length ?? 0}`);
  });
  console.log(`  join된 payloadString.length: ${payloadStr.length}`);
  console.log(`  앞 100자: ${payloadStr.slice(0, 100)}`);
  console.log(`  뒤 100자: ${payloadStr.slice(-100)}`);

  return { pageId: targetPage.id, payloadStr, chunkCount: chunks.length };
}

// ── 2. page property item 방식 (pagination 포함) ──────────────────────────────

async function readViaPropertyItem(pageId, propertyId) {
  console.log(`\n=== [2] page property item 방식 (pagination) ===`);
  console.log(`  pageId=${pageId}, propertyId=${propertyId}`);

  let allItems = [];
  let cursor = undefined;
  let pageNum = 0;

  while (true) {
    pageNum++;
    const url = new URL(`${NOTION_API}/pages/${pageId}/properties/${propertyId}`);
    if (cursor) url.searchParams.set("start_cursor", cursor);
    url.searchParams.set("page_size", "100");

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Property item fetch ${res.status}: ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    console.log(`  page ${pageNum}: type=${json.type}, results=${json.results?.length ?? "N/A"}, has_more=${json.has_more}`);

    if (json.type === "property_item") {
      // single value (not paginated)
      const items = json.results ?? [];
      allItems.push(...items);
      break;
    }

    // paginated list
    const items = json.results ?? [];
    allItems.push(...items);

    if (!json.has_more) break;
    cursor = json.next_cursor;
  }

  console.log(`  총 item 수: ${allItems.length}`);
  allItems.forEach((item, i) => {
    const pt = item.rich_text?.plain_text ?? item.plain_text ?? "";
    console.log(`    item[${i}]: len=${pt.length}`);
  });

  const payloadStr = allItems
    .map((item) => item.rich_text?.plain_text ?? item.plain_text ?? "")
    .join("");

  console.log(`  join된 payloadString.length: ${payloadStr.length}`);
  console.log(`  앞 100자: ${payloadStr.slice(0, 100)}`);
  console.log(`  뒤 100자: ${payloadStr.slice(-100)}`);

  return { payloadStr, itemCount: allItems.length };
}

// ── 3. JSON.parse 분석 ────────────────────────────────────────────────────────

function analyzeJsonParse(label, payloadStr) {
  console.log(`\n=== [3] JSON.parse 분석 (${label}) ===`);
  console.log(`  payloadString.length: ${payloadStr.length}`);
  try {
    JSON.parse(payloadStr);
    console.log("  ✅ JSON.parse 성공");
    return true;
  } catch (err) {
    console.log(`  ❌ JSON.parse 실패: ${err.message}`);

    // position 추출
    const match = err.message.match(/position (\d+)/);
    const pos = match ? parseInt(match[1]) : null;

    if (pos !== null) {
      console.log(`  error position: ${pos}`);
      const start = Math.max(0, pos - 250);
      const end = Math.min(payloadStr.length, pos + 250);
      console.log(`  position ${pos} 앞뒤 250자:`);
      console.log(`    ...${JSON.stringify(payloadStr.slice(start, end))}...`);
    }

    console.log(`  앞 100자: ${payloadStr.slice(0, 100)}`);
    console.log(`  뒤 100자: ${payloadStr.slice(-100)}`);
    return false;
  }
}

// ── 4. 프로퍼티 ID 조회 ────────────────────────────────────────────────────────

async function getPropertyId(pageId, propName) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, { headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Page retrieve ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const prop = json.properties?.[propName];
  if (!prop) throw new Error(`Property "${propName}" not found in page`);
  return prop.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    // Step 1: DB query 방식으로 읽기
    const { pageId, payloadStr: dbPayloadStr, chunkCount } = await readViaDbQuery();

    // Step 1 결과 파일 저장
    fs.writeFileSync("debug-payload-db-query.txt", dbPayloadStr, "utf-8");
    console.log("\n  파일 저장: debug-payload-db-query.txt");

    // Step 2: DB query 결과 JSON.parse
    const dbOk = analyzeJsonParse("databases/query 방식", dbPayloadStr);

    // Step 3: property item 방식으로 읽기
    const propId = await getPropertyId(pageId, "payload");
    console.log(`\n  payload 프로퍼티 ID: ${propId}`);

    const { payloadStr: propPayloadStr, itemCount } = await readViaPropertyItem(pageId, propId);

    // Step 3 결과 파일 저장
    fs.writeFileSync("debug-payload-prop-item.txt", propPayloadStr, "utf-8");
    console.log("  파일 저장: debug-payload-prop-item.txt");

    // Step 4: property item 결과 JSON.parse
    const propOk = analyzeJsonParse("property item 방식", propPayloadStr);

    // Step 5: 길이 비교
    console.log("\n=== [요약] ===");
    console.log(`  DB query 방식: ${dbPayloadStr.length}자 (chunks=${chunkCount}) → ${dbOk ? "✅" : "❌"}`);
    console.log(`  Property item 방식: ${propPayloadStr.length}자 (items=${itemCount}) → ${propOk ? "✅" : "❌"}`);

    if (dbPayloadStr.length !== propPayloadStr.length) {
      console.log(`  ⚠ 길이 불일치! DB query가 ${propPayloadStr.length - dbPayloadStr.length}자 짧음`);
      console.log("  → Notion databases/query가 rich_text를 truncate하고 있음");
    }

  } catch (err) {
    console.error("FATAL:", err.message);
    process.exit(1);
  }
})();
