import { readFileSync } from 'fs';
const str = readFileSync('debug-payload-db-query.txt', 'utf-8');
console.log('원본 length:', str.length);

// Level-1: 객체 값 문맥의 stray ] 제거 (: "value"] 패턴만)
function repairStrayBrackets(s) {
  const r = s.replace(/(:\s*"(?:[^"\\]|\\.)*")\](?=[,}])/g, '$1');
  return { repaired: r, wasRepaired: r !== s };
}

// Level-2: source_meta 섹션 제거
function stripSourceMeta(s) {
  const key = '"source_meta"';
  const idx = s.indexOf(key);
  if (idx === -1) return { repaired: s, wasRepaired: false };
  let start = idx + key.length;
  while (start < s.length && s[start] !== '{') start++;
  if (start >= s.length) return { repaired: s, wasRepaired: false };
  let depth = 0, end = start, inString = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (depth !== 0) return { repaired: s, wasRepaired: false };
  return { repaired: s.slice(0, idx) + '"source_meta":{}' + s.slice(end + 1), wasRepaired: true };
}

// 파이프라인 실행
try { JSON.parse(str); console.log('✅ 원본 파싱 성공'); process.exit(0); }
catch(e) { console.log('❌ 원본 파싱 실패:', e.message.slice(0, 80)); }

const { repaired: r1, wasRepaired: w1 } = repairStrayBrackets(str);
console.log('Level-1 stray] repair:', w1);
if (w1) {
  try { JSON.parse(r1); console.log('✅ Level-1 후 파싱 성공'); process.exit(0); }
  catch(e) { console.log('❌ Level-1 후 실패:', e.message.slice(0, 80)); }
}

const base = w1 ? r1 : str;
const { repaired: r2, wasRepaired: w2 } = stripSourceMeta(base);
console.log('Level-2 source_meta strip:', w2);
if (w2) {
  try {
    JSON.parse(r2);
    console.log('✅ Level-2 후 파싱 성공, length:', r2.length);
  } catch(e) {
    console.log('❌ Level-2 후도 실패:', e.message.slice(0, 80));
    const p = parseInt(e.message.match(/position (\d+)/)?.[1] ?? '0');
    console.log('실패 position 앞뒤 150자:', JSON.stringify(r2.slice(Math.max(0,p-75), p+75)));
  }
}
