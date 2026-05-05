---
name: 업무현황-payload
description: "피자레디 팀 업무현황 v2.4.1 payload를 Notion+Slack에서 수집·생성·저장하는 스킬. '업무현황 만들어줘', '대시보드 업데이트', 'payload 생성', '업무현황 실행', '주간 업무현황'을 언급하면 이 스킬을 사용한다."
---

# 업무현황 Payload 생성 스킬

## ⚠️ 절대 하지 말아야 할 것

아래 단계는 **실행 경로에 없다.** 어떤 이유로도 시도하지 않는다:

- ❌ "업무현황 요약 대상 설정 DB" 탐색 — 존재하지 않음, 탐색 불필요
- ❌ Vercel project 탐색 (`list_projects`, `No Vercel project found`) — payload 생성과 무관
- ❌ 주간메모 / human_note / human_note_count 생성
- ❌ "요약 대상 설정", "summary target", "target config" 검색
- ❌ `query-data-sources` 도구 호출 — 이 이름의 MCP 도구는 존재하지 않는다. 절대 호출하지 말 것
- ❌ `notion-update-data-source`를 task 조회 목적으로 사용 — 이 도구는 데이터 수정 전용
- ❌ 위 항목 중 하나가 없다는 이유로 실행 중단

이 중 하나라도 하려고 한다면 즉시 멈추고 아래 필수 단계로 돌아간다.

---

## 필수 실행 단계 (이 순서대로만)

### Step 1: Notion 프로젝트 리스트 수집

`notion-fetch` 또는 `notion-update-data-source`로 아래를 조회한다:

- **`🗃️ 프로젝트 리스트`** DB
  - 페이지 ID: `27eb4a4650038016a5fef8ce4bff328c`
  - 필드: 이름, 요약, 채널명, 키워드, 조회 기간
  - 활성 프로젝트만 수집 (완료/아카이브 제외)

---

### Step 2: Notion 팀 작업 현황 수집

#### 고정값 (탐색 금지 — 항상 이 값을 사용한다)

```
data_source_id : 3e7e5c84-baef-444c-ab32-a5fea7fd9161
collection_url : collection://3e7e5c84-baef-444c-ab32-a5fea7fd9161
db_page_id     : ad7f7eab-8df5-4fb0-9e5e-0133bffc9e88
```

#### DB 스키마 (property 이름 정확히 준수)

| 필드 | 타입 | 활성 값 (완료 제외) |
|------|------|--------------------|
| `작업` | title | — |
| `Status` | status | `시작 전`, `진행 예정`, `일시 정지`, `검토중`, `추가 진행`, `진행 중`, `확인 요청` |
| `담당자` | person | — |
| `프로젝트` | select | Wool Loop, 피자레디, 버거플리즈, 버거시뮬레이터, 피자시뮬레이터, My Burger Diner, Wool Arrow, 포지 앤 포춘, 커피브레이크, 도넛Inc., Lane Guardians, 기타 |
| `팀` | select | 기획, 개발, 아트 |
| `Sprint` | select | Sprint25, Sprint24, Sprint23, ... |
| `우선순위` | select | 0순위, 1순위, 2순위, 3순위, 4순위, 상시 |
| `시작날짜 <-> Dead Line` | date | — |
| `문서 링크` | url | — |

완료 상태(제외 대상): `완료`, `중단`

#### 수집 우선순위 (1순위부터 시도, 성공하면 즉시 해당 단계에서 멈춤)

**1순위 — data_source_id 직접 검색 (structured_query)**

```
notion-search:
  query: "진행 중 작업 담당자"
  data_source_url: "collection://3e7e5c84-baef-444c-ab32-a5fea7fd9161"
  query_type: "internal"
  page_size: 25
```

- 결과 1건 이상 → 성공. `retrieval_mode = "structured_query"`
- 결과 0건이지만 오류 없음 → 2순위로 (빈 DB가 아니라 검색어 문제일 수 있음)
- 도구 오류 / 접근 실패 → 2순위로

**2순위 — 광범위 검색 후 코드 필터 (structured_query)**

```
notion-search:
  query: "작업"
  data_source_url: "collection://3e7e5c84-baef-444c-ab32-a5fea7fd9161"
  query_type: "internal"
  page_size: 25
```

조회 후 `Status` 가 `완료`·`중단`인 항목은 **코드에서** 제외.
`담당자`, `프로젝트`, `팀`, `Sprint`, `우선순위`, `시작날짜 <-> Dead Line` 으로 후처리 분류.

- 결과 1건 이상 → 성공. `retrieval_mode = "structured_query"`
- 오류 또는 0건 → 3순위로

**3순위 — DB 페이지 fetch (db_fetch)**

```
notion-fetch:
  id: "ad7f7eab-8df5-4fb0-9e5e-0133bffc9e88"
```

반환된 DB 뷰·항목에서 task 목록 추출.
`retrieval_mode = "db_fetch"`

- 내용 존재 → 성공
- 접근 불가 → 4순위로

**4순위 — 검색 기반 핵심 evidence fallback (search_fallback)**

```
notion-search:
  query: "팀 작업 현황 진행"
  query_type: "internal"
  page_size: 25
```

- 이 단계까지 온 경우 `primary_query_failed = true`, `fallback_used = true`
- `retrieval_mode = "search_fallback"`

#### 입력 검증 실패 시 점검 순서

`notion-search` 에 `data_source_url` 을 줬는데 오류가 나면 다음 순서로 확인한다:

1. `data_source_url` 이 `collection://...` 형식인지 확인 (page_id나 URL 형식 ❌)
2. `query_type: "internal"` 인지 확인
3. `content_search_mode` 를 명시하지 않고 자동 선택에 맡겼는지 확인
4. 위 확인 후에도 실패하면 다음 순위로 넘어가고 `failure_reason` 에 오류 내용 기록

---

### Step 3: Slack 운영 신호 수집

각 프로젝트의 `채널명` 필드에서 채널을 파악하고 최근 7일 메시지 수집:
- 블로커, 지연, 확인 요청, 의사결정 대기 신호 추출
- signal type: `blocker | schedule_change | confirm_request | decision_waiting | discussion_spike | repeated_issue`

---

### Step 4: payloadObject 생성

아래 구조로 JSON 객체 생성:

```json
{
  "date": "YYYY-MM-DD",
  "run_id": "YYYY-MM-DD-HHMM",
  "payload_version": "2.4.1",
  "schema_version": "molip-dashboard-v2",
  "status": "success|partial|failed",
  "overview": {
    "overall_status": "normal|watch|risk|blocked",
    "summary": "전체 요약 (1~3문장)",
    "metrics": { ... },
    "top_attention_items": [ ... ],
    "ceo_action_queue": [ ... ],
    "priority_projects": [ ... ],
    "confirmation_queue": [ ... ]
  },
  "project_progress": [
    {
      "project": "프로젝트명",
      "priority_rank": 1,
      "priority_score": 80,
      "status": "watch",
      "display_summary": "...",
      "workstreams": [ ... ],
      "confirmation_queue": [ ... ],
      "risks": [ ... ]
    }
  ],
  "data_health": {
    "notion_tasks": {
      "status": "success|partial",
      "retrieval_mode": "structured_query|db_fetch|search_fallback",
      "primary_query_failed": false,
      "fallback_used": false,
      "failure_reason": null,
      "count": 0,
      "confidence_impact": "none|low|medium|high"
    }
  },
  "source_meta": {
    "project_config_db": "🗃️ 프로젝트 리스트",
    "project_config_access": "name_first_url_fallback",
    "project_config_url": "27eb4a4650038016a5fef8ce4bff328c",
    "notion_task_db": "😃 팀 작업 현황",
    "notion_task_access": "data_source_id_first_name_fallback",
    "notion_task_data_source_id": "3e7e5c84-baef-444c-ab32-a5fea7fd9161",
    "notion_task_retrieval_mode": "structured_query|db_fetch|search_fallback",
    "summary_db": "📊 업무현황 요약"
  }
}
```

#### data_health.notion_tasks 작성 규칙

| 상황 | status | retrieval_mode | primary_query_failed | fallback_used | confidence_impact |
|------|--------|---------------|----------------------|--------------|-------------------|
| 1·2순위 성공 | success | structured_query | false | false | none |
| 3순위 성공 | partial | db_fetch | true | true | low |
| 4순위 성공 | partial | search_fallback | true | true | medium |
| 전 순위 실패 | partial | search_fallback | true | true | high |

`failure_reason`: 실패한 경우에만 기재. 오류 메시지 또는 "data_source_url 접근 불가", "0건 반환" 등 짧게.

#### partial 상태에서 과장 금지

`retrieval_mode` 가 `db_fetch` 또는 `search_fallback` 인 경우:
- 담당자별 전체 작업량 집계 → 수집된 건만 표기, "전체" 표현 사용 금지
- stale task 수 → 수집된 범위 내에서만 산정
- 프로젝트별 task coverage → partial이므로 percentage 불가, 건수만 기재
- `owner_status` 정확도 → confidence 낮음 명시
- `confidence_score` → full(1.0 기준) 대비 -0.15 (db_fetch) / -0.25 (search_fallback) 적용

**주의:**
- `human_note`, `human_note_count` 필드는 넣지 않는다
- `project_config_url`에 전체 URL(`https://www.notion.so/...`)을 넣지 않는다. 페이지 ID만 넣는다

---

### Step 5: JSON 직렬화 + JSON.parse 검증

```
payloadString = JSON.stringify(payloadObject)
JSON.parse(payloadString)  # 여기서 실패하면 절대 저장하지 않는다
```

---

### Step 6: Hard Gate 검증

아래 조건을 모두 통과해야 한다:

1. `JSON.parse` 성공
2. `overview` 필드 존재
3. `project_progress` 배열이 존재하고 1개 이상
4. `payload_version`이 존재하면 반드시 `"2.4.1"`
5. `schema_version`이 존재하면 반드시 `"molip-dashboard-v2"`

통과하지 못하면 저장하지 않고 오류를 기록한다.

---

### Step 7: Notion 📊 업무현황 요약 저장

**저장 대상은 탐색하지 않는다. 아래 고정값을 항상 사용한다:**

```
data_source_id: 351b4a46-5003-805e-8466-000b363c5952
```

`notion-create-pages` MCP 도구 사용:

```json
{
  "parent": { "data_source_id": "351b4a46-5003-805e-8466-000b363c5952" },
  "properties": {
    "이름": { "title": [{ "text": { "content": "YYYY-MM-DD 업무현황 요약" } }] },
    "기준일": { "date": { "start": "YYYY-MM-DD" } },
    "run_id": { "rich_text": [{ "text": { "content": "run_id값" } }] },
    "상태": { "select": { "name": "success|partial|failed" } },
    "생성_방식": { "select": { "name": "agent" } },
    "프로젝트_수": { "number": N },
    "전체_상태": { "select": { "name": "..." } },
    "전체_요약": { "rich_text": [{ "text": { "content": "..." } }] },
    "payload": { "rich_text": [ /* 2000자씩 청크 분할 */ ] }
  }
}
```

**청크 분할 규칙:**
- payload JSON 문자열을 **정확히 2000자 단위**로 분할
- 각 청크는 `{ "text": { "content": "..." } }` 형태
- URL이 포함된 청크는 URL을 ID 형태로 변환하여 Notion 자동 링크 방지
- 전체 청크 수 = `Math.ceil(payloadString.length / 2000)`

---

### Step 8: 저장 후 재조회 + JSON.parse 검증

저장된 페이지를 `notion-fetch`로 읽어:
1. `payload` 필드의 `rich_text` 청크를 모두 이어붙인다
2. `JSON.parse`가 성공하는지 확인한다
3. 실패하면 `[ERROR] 저장 후 JSON.parse 실패`를 기록한다

---

### Step 9: last_run.json 갱신

`scripts/last_run.json`을 아래 형식으로 저장/갱신한다:

```json
{
  "run_id": "YYYY-MM-DD-HHMM",
  "date": "YYYY-MM-DD",
  "status": "success|partial|failed",
  "stage": "completed|payload_invalid|save_failed|verify_failed",
  "notion_page_id": "페이지ID",
  "notion_url": "https://notion.so/...",
  "project_count": N,
  "payload_length": N,
  "errors": [],
  "warnings": [],
  "saved_at": "ISO timestamp"
}
```

실패 시에도 아래 필드를 반드시 포함한다:
```json
{
  "run_id": "...",
  "date": "...",
  "stage": "실패한_단계명",
  "status": "failed",
  "error": "오류 메시지",
  "recommended_action": "다음에 할 것"
}
```

---

## 에러 핸들링

| 상황 | 처리 |
|------|------|
| 팀 작업 현황 1~3순위 모두 실패 | 4순위 fallback 시도. `data_health.notion_tasks.status = "partial"` |
| 팀 작업 현황 전 순위 실패 | `data_health.notion_tasks.status = "partial"`, `confidence_impact = "high"`. 수집된 evidence 0건으로 payload 진행 |
| Slack 접근 실패 | `status: "partial"`, `slack_signals: []`, 계속 진행 |
| Hard Gate 실패 | 저장 안 함, `stage: "payload_invalid"` 기록 |
| Notion 저장 실패 | `stage: "save_failed"`, 페이지 ID 없이 기록 |
| 재조회 JSON.parse 실패 | `stage: "verify_failed"`, 경고 기록 |

---

## 실행 후 보고 형식

```
✅ 또는 ❌ run_id: YYYY-MM-DD-HHMM
- payload 생성: ✅/❌
- JSON.parse 검증: ✅/❌
- Hard Gate: ✅/❌
- 저장: ✅/❌ (페이지 ID)
- 재조회 JSON.parse: ✅/❌
- Notion 링크: https://notion.so/...
- 프로젝트 수: N
- notion_task 수집: structured_query N건 / db_fetch N건 / search_fallback N건
- warnings: [...]
- errors: [...]
```
