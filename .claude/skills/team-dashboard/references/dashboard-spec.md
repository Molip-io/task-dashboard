# HTML 대시보드 스펙

오케스트레이터가 HTML 대시보드를 생성할 때 참조하는 구조/스타일/데이터 스펙.

## 목차
1. [전체 레이아웃](#1-전체-레이아웃)
2. [컴포넌트 상세](#2-컴포넌트-상세)
3. [스타일 시스템](#3-스타일-시스템)
4. [탭 전환 로직](#4-탭-전환-로직)
5. [데이터 주입 형식](#5-데이터-주입-형식)

---

## 1. 전체 레이아웃

```
┌─────────────────────────────────────┐
│  헤더: 팀 업무 현황 대시보드         │
│  부제: 생성일시 | 데이터 소스 표시    │
├─────────────────────────────────────┤
│  요약 카드 (가로 배열)               │
│  [전체] [긴급] [지연] [블로커] [미등록]│
├─────────────────────────────────────┤
│  탭 네비게이션                       │
│  [팀별] [프로젝트별] [담당자별] [갭분석]│
├─────────────────────────────────────┤
│  탭 콘텐츠 영역                      │
│  (선택된 탭에 따라 내용 변경)          │
├─────────────────────────────────────┤
│  슬랙 주요 논의 섹션                  │
│  의사결정 / 액션아이템 / 블로커        │
├─────────────────────────────────────┤
│  푸터: 수집 메타데이터                │
└─────────────────────────────────────┘
```

## 2. 컴포넌트 상세

### 2-1. 요약 카드

5개의 카드를 가로로 배열한다. 각 카드에는 숫자와 라벨을 표시한다.

| 카드 | 배경색 | 아이콘 | 라벨 |
|------|--------|--------|------|
| 전체 작업 | #3B82F6 (파랑) | - | 전체 |
| 긴급/임박 | #EF4444 (빨강) | - | 긴급 |
| 지연 | #F59E0B (주황) | - | 지연 |
| 블로커 | #8B5CF6 (보라) | - | 블로커 |
| 미등록 작업 | #6B7280 (회색) | - | 미등록 |

### 2-2. 팀별 탭

각 팀(기획팀, 개발팀, 아트팀 + 기타)을 접을 수 있는(collapsible) 섹션으로 표시한다.

```html
<div class="team-section">
  <h3 class="team-header" onclick="toggle(this)">
    ▼ 개발팀 (18건)
  </h3>
  <table>
    <thead>
      <tr>
        <th>작업명</th><th>담당자</th><th>상태</th>
        <th>마감일</th><th>프로젝트</th><th>슬랙 논의</th>
      </tr>
    </thead>
    <tbody>
      <!-- 데이터 행 -->
    </tbody>
  </table>
</div>
```

### 2-3. 프로젝트별 탭

각 프로젝트를 섹션으로 표시. 노션 작업 + 관련 슬랙 논의를 함께 보여준다.

```
[프로젝트명] — 전체 N건 (진행중 N, 대기 N, 긴급 N)
├── 작업 테이블
└── 관련 슬랙 논의 목록
```

### 2-4. 담당자별 탭

각 담당자를 카드 형태로 표시. 담당 작업 목록 + 관련 슬랙 활동을 보여준다.

```
┌─────────────────────────┐
│ 김민수 (개발팀)          │
│ 작업 5건 | 긴급 1건      │
├─────────────────────────┤
│ ● API 인증 리팩토링 [지연]│
│ ● 테스트 자동화 [대기]    │
│ ● ...                    │
├─────────────────────────┤
│ 슬랙: 코드리뷰 요청 대기  │
└─────────────────────────┘
```

### 2-5. 갭 분석 탭

3개 섹션으로 구성:

1. **미등록 작업**: 슬랙에서만 논의 중인 작업
2. **장기 미업데이트**: 7일 이상 변경 없는 작업
3. **담당자 미배정**: 담당자가 없는 작업

각 항목에 출처와 근거를 표시한다.

### 2-6. 슬랙 주요 논의 섹션

탭 아래에 항상 표시되는 고정 섹션:

| 유형 | 아이콘 | 표시 내용 |
|------|--------|----------|
| 의사결정 | 📌 | 내용, 채널, 날짜 |
| 액션 아이템 | ✅ | 담당자, 내용, 기한 |
| 블로커 | 🚫 | 내용, 관련 프로젝트, 심각도 |

## 3. 스타일 시스템

### 3-1. 자체 포함 원칙

외부 CDN에 의존하지 않는다. 모든 CSS를 `<style>` 태그에 인라인으로 포함한다. 네트워크 없이도 완전히 동작해야 한다.

### 3-2. 상태 배지 색상

```css
.status-urgent    { background: #FEE2E2; color: #991B1B; } /* 긴급/지연 */
.status-progress  { background: #DBEAFE; color: #1E40AF; } /* 진행중 */
.status-waiting   { background: #F3F4F6; color: #374151; } /* 대기 */
.status-done      { background: #D1FAE5; color: #065F46; } /* 완료 */
.status-blocked   { background: #EDE9FE; color: #5B21B6; } /* 블로커 */
```

### 3-3. 기본 스타일

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #F9FAFB;
  color: #111827;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}
th { background: #F3F4F6; text-align: left; padding: 8px 12px; }
td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; }
```

### 3-4. 반응형

```css
@media (max-width: 768px) {
  .summary-cards { flex-direction: column; }
  .person-grid { grid-template-columns: 1fr; }
  table { font-size: 14px; }
}
```

## 4. 탭 전환 로직

순수 JavaScript로 탭 전환을 구현한다:

```javascript
function showTab(tabId) {
  // 모든 탭 콘텐츠 숨기기
  document.querySelectorAll('.tab-content').forEach(el => {
    el.style.display = 'none';
  });
  // 모든 탭 버튼 비활성
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active');
  });
  // 선택된 탭 표시
  document.getElementById(tabId).style.display = 'block';
  event.target.classList.add('active');
}

function toggle(header) {
  const content = header.nextElementSibling;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  header.textContent = header.textContent.replace(
    isHidden ? '▶' : '▼',
    isHidden ? '▼' : '▶'
  );
}
```

## 5. 데이터 주입 형식

오케스트레이터는 Phase 3의 분석 결과를 HTML 요소로 직접 렌더링한다. 별도의 JSON 데이터 레이어 없이, 분석된 데이터를 바로 HTML 테이블 행(`<tr>`)과 카드(`<div>`)로 변환한다.

### 상태 매핑

| 노션 상태 | 배지 클래스 | 표시 텍스트 |
|----------|-----------|-----------|
| 진행 중, In Progress | status-progress | 진행중 |
| 할 일, To Do, 예정 | status-waiting | 대기 |
| 완료, Done | status-done | 완료 |
| 마감 3일 이내 | status-urgent | 긴급 |
| 마감 지남 | status-urgent | 지연 |
| 블로킹, Blocked, 대기(외부) | status-blocked | 블로커 |

### 마감일 표시 규칙

- 3일 이내: 빨간색 텍스트 + "(D-N)" 표시
- 이미 지남: 빨간색 볼드 + "(D+N 지연)" 표시
- 그 외: 일반 텍스트
- 마감일 없음: "-" 표시

### 데이터 없는 섹션 처리

슬랙 데이터가 없거나 특정 뷰에 항목이 없는 경우:
```html
<div class="empty-state">
  데이터를 수집하지 못했습니다. (슬랙 연결 소스 설정이 필요할 수 있습니다)
</div>
```
