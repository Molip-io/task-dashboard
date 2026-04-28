# MOLIP 업무현황 대시보드 — 설정 가이드

ChatGPT Agent가 Notion + Slack 요약 JSON을 POST하면, 이 앱이 저장 & 표시합니다.

---

## 로컬 실행

### 1. 의존성 설치

```bash
cd molip-dashboard
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 편집:

```env
# 필수: POST API 인증 토큰 (Agent와 공유)
DASHBOARD_API_TOKEN=your-secret-token-here

# 선택: Supabase (없으면 in-memory fallback — 서버 재시작 시 데이터 초기화됨)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### 3. 개발 서버 실행

```bash
npm run dev
# http://localhost:3000 에서 확인
```

### 4. API 테스트

```bash
# POST — 데이터 저장
curl -X POST http://localhost:3000/api/work-status-summaries \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-04-29",
    "run_id": "2026-04-29-1000",
    "results": [
      {
        "target_key": "pizza_ready",
        "target_name": "피자 레디",
        "target_type": "project",
        "lookback_days": 14,
        "summary": "전반적으로 순항 중입니다.",
        "status": "normal",
        "errors": [], "warnings": [], "highlights": [],
        "delays": [], "blockers": [], "bottlenecks": [],
        "risks": [], "attention_items": [],
        "source_meta": {
          "notion_db": "팀 작업 현황",
          "notion_filter": "프로젝트 = 피자 레디",
          "slack_channels": [], "slack_keywords": [],
          "notion_items": 5, "slack_messages": 12,
          "window_start": "2026-04-15", "window_end": "2026-04-29"
        },
        "run_status": "success"
      }
    ],
    "status": "success"
  }'

# GET — 최신 결과 조회
curl http://localhost:3000/api/work-status-summaries/latest
```

---

## Supabase 설정

### 1. 프로젝트 생성

[Supabase 대시보드](https://supabase.com/dashboard) → New Project

### 2. 테이블 생성

SQL Editor에서 `supabase-schema.sql` 내용 실행:

```sql
create table work_status_runs (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  run_id      text not null unique,
  status      text not null,
  results     jsonb not null,
  created_at  timestamptz default now()
);

create index on work_status_runs (date desc);
create index on work_status_runs (created_at desc);
```

### 3. Service Role Key 복사

Settings → API → `service_role` (secret) 키 복사 → `SUPABASE_SERVICE_KEY`에 사용

> ⚠️ `anon` 키가 아니라 `service_role` 키를 사용해야 합니다 (RLS 우회).

---

## Vercel 배포

### 1. 배포

```bash
npx vercel --prod
# 또는 GitHub 연동 후 자동 배포
```

### 2. 필수 환경변수 설정

Vercel Dashboard → Project → Settings → Environment Variables:

| 변수 | 설명 | 필수 |
|------|------|------|
| `DASHBOARD_API_TOKEN` | POST API 인증 Bearer 토큰 | ✅ |
| `SUPABASE_URL` | Supabase 프로젝트 URL | ✅ (prod) |
| `SUPABASE_SERVICE_KEY` | Supabase service role 키 | ✅ (prod) |

> Vercel은 서버리스 환경이므로 **in-memory fallback은 동작하지 않습니다.** 반드시 Supabase를 설정해야 합니다.

### 3. 배포 전 체크리스트

- [ ] `DASHBOARD_API_TOKEN` Vercel env에 등록
- [ ] `SUPABASE_URL` Vercel env에 등록
- [ ] `SUPABASE_SERVICE_KEY` Vercel env에 등록
- [ ] Supabase 테이블 `work_status_runs` 생성 완료
- [ ] `npm run build` 로컬에서 오류 없이 통과
- [ ] Agent 쪽에 Vercel URL과 `DASHBOARD_API_TOKEN` 전달

---

## Agent POST 예시

ChatGPT Agent가 아래와 같이 호출합니다:

```
POST https://your-app.vercel.app/api/work-status-summaries
Authorization: Bearer <DASHBOARD_API_TOKEN>
Content-Type: application/json

{
  "date": "YYYY-MM-DD",
  "run_id": "YYYY-MM-DD-HHmm",
  "results": [...],
  "status": "success | partial | failed"
}
```

응답:
```json
{ "ok": true, "id": "<uuid>", "run_id": "2026-04-29-1000" }
```

---

## API 명세

### POST /api/work-status-summaries

| 항목 | 내용 |
|------|------|
| 인증 | `Authorization: Bearer <DASHBOARD_API_TOKEN>` |
| 응답 성공 | `201 { ok: true, id, run_id }` |
| 응답 실패 | `401 Unauthorized` / `400 Missing fields` / `500 Storage error` |

### GET /api/work-status-summaries/latest

| 항목 | 내용 |
|------|------|
| 인증 | 없음 (공개) |
| 응답 성공 | `200 StoredRun` |
| 응답 없음 | `404 { error: "No data yet" }` |
