# 피자레디 팀 업무 대시보드

## 프로젝트 개요

Notion + Slack 데이터를 통합해 팀 업무 현황을 자동으로 파악하는 대시보드.
관리자가 30초 안에 "이번 주 뭐가 문제인지" 파악 가능하도록 설계.

**스택:** Next.js 16 + TypeScript + Tailwind CSS (team-dashboard/)

## 핵심 아키텍처 결정사항

### Reconciliation Engine
- Notion(계획) vs Slack(실제) 불일치를 자동 감지
- 3단계 매칭: 채널→프로젝트 → 메시지→작업(담당자 우선) → 블로커 키워드 감지
- 블로커 키워드(좁게): 블로커, 막혔, 지연, blocked, stuck, waiting (이슈/버그/에러 제외)
- 부정 패턴 필터: "이슈 없음", "resolved" 등은 conflict 미적용
- WorkItem.project가 source of truth (inferProjectFromDB() 아님)

### API
- 단일 `/api/dashboard` 라우트 (별도 /api/briefing 없음)
- 10초 timeout + Slack 실패 시 partial response (warnings 배열)
- revalidate = 60초

### UI
- 2모드 토글: 현황판(실시간) / 주간 브리핑
- 현황판: SummaryCards → 필터 → 주의필요 섹션 → WorkTable/ProjectView
- 브리핑: 주의필요 / 순항중(접힘) / 완료 / Slack 다이제스트

### 캐싱
- Slack users.list: 24h 모듈 레벨 캐시 (rate limit 보호)
- ISR: 60초 revalidation

## 현재 구현 상태 (2026-04-05)

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 1 | Reconciliation Engine + API + 테스트 | ✅ 완료 |
| Phase 2 | 2모드 Dashboard UI + BriefingView | ✅ 완료 |
| Phase 3 | Slack 브리핑 자동 배달 (Vercel Cron) | ✅ 완료 |

**최신 커밋:** 7cc957b (main)
**테스트:** vitest 34/34 통과

## 주요 파일 구조

```
team-dashboard/src/
  lib/
    notion.ts          — WorkItem 타입 + fetchDashboardData() (수정 금지)
    slack.ts           — fetchSlackData() + fetchSlackUsers() 24h 캐시
    status.ts          — isDone/isInProgress/isOverdue/isUrgent (공유)
    reconciliation.ts  — 3단계 매칭 엔진
  components/
    Dashboard.tsx      — 2모드 토글 메인 컴포넌트
    BriefingView.tsx   — 주간 브리핑 3섹션
    SlackDigest.tsx    — 슬랙 4카테고리 다이제스트 (재사용)
    ProjectView.tsx    — 프로젝트 카드 + reconciliation 뱃지
    SummaryCards.tsx   — 요약 카드 5개
    WorkTable.tsx      — 작업 테이블 (수정 금지)
  app/api/
    dashboard/route.ts       — 메인 API (timeout + reconciliation)
    briefing/deliver/route.ts — Slack 배달 (Vercel Cron POST)
scripts/
  spike-reconciliation.ts    — 실제 데이터 정확도 검증 (npm run spike)
vercel.json                  — Cron 설정 (월요일 09:00 KST)
```

## 다음 단계

1. **.env.local 설정** → `npm run spike` 실행 (reconciliation 정확도 확인)
2. **Go/No-Go 기준:** 3건 이상 정확 감지 시 GO, 오탐 50%+ 시 키워드 튜닝
3. **Vercel 배포** → SLACK_BRIEFING_CHANNEL, CRON_SECRET env 설정
4. **2주 spot-check** → 👍/👎 피드백 데이터로 정확도 측정

## 의도적으로 제외한 항목 (Phase 2+)

- 슬랙 스레드 리플라이 (spike 결과 후 결정)
- 역할별 뷰 (실사용 피드백 후)
- 모바일 최적화
- LLM 요약 (키워드 기반으로 충분한지 먼저 확인)

---

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
