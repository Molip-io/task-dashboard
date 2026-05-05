// Fetch raw payload and save to file + inspect corruption
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) { console.error("NOTION_TOKEN 환경변수를 설정해주세요."); process.exit(1); }
const PAGE_ID = "356b4a46-5003-812f-af57-e91047f2827b";

async function main() {
  const res = await fetch(`https://api.notion.com/v1/pages/${PAGE_ID}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
    },
  });

  const page = await res.json();
  const richText = page.properties?.payload?.rich_text ?? [];

  // Build payload string + track chunk boundaries
  let payload = "";
  let pos = 0;
  for (const item of richText) {
    const text = item.plain_text ?? "";
    console.log(`chunk pos=${pos} type=${item.type} len=${text.length} first30=${JSON.stringify(text.slice(0, 30))}`);
    payload += text;
    pos += text.length;
  }

  // Save raw payload
  const outPath = join(__dir, "payload-raw.txt");
  writeFileSync(outPath, payload, "utf8");
  console.log(`\nSaved to ${outPath} (${payload.length} chars)`);

  // Show chars around position 14692
  const ERR_POS = 14692;
  console.log(`\n=== Chars around position ${ERR_POS} ===`);
  for (let i = ERR_POS - 10; i <= ERR_POS + 10; i++) {
    const ch = payload[i];
    const code = payload.charCodeAt(i);
    console.log(`[${i}] code=${code} char=${JSON.stringify(ch)}`);
  }

  // Show full context
  const start = Math.max(0, ERR_POS - 150);
  const end = Math.min(payload.length, ERR_POS + 100);
  console.log(`\n=== Context [${start}..${end}] ===`);
  console.log(payload.slice(start, end));

  // Attempt JSON.parse
  try {
    JSON.parse(payload);
    console.log("\n✅ JSON.parse OK");
  } catch (err) {
    console.log("\n❌ JSON.parse:", err.message);
  }

  // Show what the CORRECT source_meta section should look like
  console.log("\n=== source_meta region ===");
  const smIdx = payload.indexOf('"source_meta"');
  if (smIdx >= 0) {
    console.log(`source_meta starts at position ${smIdx}`);
    console.log(payload.slice(smIdx, smIdx + 500));
  }
}

main().catch(console.error);
