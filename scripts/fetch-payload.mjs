// Fetch raw payload from Notion page 356b4a46-5003-812f-af57-e91047f2827b
// and inspect position 14692

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) { console.error("NOTION_TOKEN 환경변수를 설정해주세요."); process.exit(1); }
const PAGE_ID = "356b4a46-5003-812f-af57-e91047f2827b";
const INSPECT_POS = 14692;
const WINDOW = 250;

async function main() {
  const res = await fetch(`https://api.notion.com/v1/pages/${PAGE_ID}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("API error:", res.status, text.slice(0, 300));
    process.exit(1);
  }

  const page = await res.json();
  const payloadProp = page.properties?.payload;
  if (!payloadProp) {
    console.error("No payload property found");
    console.log("Available properties:", Object.keys(page.properties ?? {}));
    process.exit(1);
  }

  console.log("payload prop type:", payloadProp.type);

  // Concatenate plain_text from all rich_text chunks
  const richText = payloadProp.rich_text ?? [];
  console.log("rich_text chunk count:", richText.length);
  richText.forEach((item, i) => {
    console.log(`  chunk[${i}]: type=${item.type}, plain_text length=${(item.plain_text ?? "").length}`);
  });

  const payload = richText.map((b) => b.plain_text ?? "").join("");
  console.log("\nTotal payload length:", payload.length);

  // Save to file
  import("node:fs").then(({ writeFileSync }) => {
    writeFileSync("/d/claude/task-dashboard/scripts/payload-raw.txt", payload);
    console.log("Saved to scripts/payload-raw.txt");
  });

  // Inspect position 14692
  const start = Math.max(0, INSPECT_POS - WINDOW);
  const end = Math.min(payload.length, INSPECT_POS + WINDOW);
  const excerpt = payload.slice(start, end);

  console.log(`\n=== Payload[${start}..${end}] (around position ${INSPECT_POS}) ===`);
  console.log(JSON.stringify(excerpt));
  console.log("\n--- raw excerpt ---");
  console.log(excerpt);

  // Check first 50 chars
  console.log("\n=== First 100 chars ===");
  console.log(JSON.stringify(payload.slice(0, 100)));

  // Find JSON.parse error position
  try {
    JSON.parse(payload);
    console.log("\n✅ JSON.parse succeeded!");
  } catch (err) {
    console.log("\n❌ JSON.parse failed:", err.message);
    // Try to find the position from the error message
    const match = err.message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1]);
      console.log(`Error position: ${pos}`);
      const s = Math.max(0, pos - 50);
      const e = Math.min(payload.length, pos + 50);
      console.log(`Context: ${JSON.stringify(payload.slice(s, e))}`);
      console.log(`Character at ${pos}: code=${payload.charCodeAt(pos)} char="${payload[pos]}"`);
      console.log(`Character at ${pos-1}: code=${payload.charCodeAt(pos-1)} char="${payload[pos-1]}"`);
    }
  }

  // Check payload_version
  const versionMatch = payload.match(/"payload_version"\s*:\s*"([^"]+)"/);
  console.log("\n=== payload_version ===");
  console.log(versionMatch ? versionMatch[1] : "NOT FOUND");
}

main().catch(console.error);
