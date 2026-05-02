/**
 * Agent payload → 프론트 타입 normalize / validate layer
 *
 * 처리 항목:
 * 1. 문자열 줄바꿈 보정 (백슬래시 누락 `n` / 이중 이스케이프 `\\n`)
 * 2. track_breakdown: 객체 → 배열 변환
 * 3. schedule_notes: string[] → string (join)
 * 4. stale_tasks: task → task_name 복사
 * 5. teams: team → team_name 복사
 * 6. confirmation_queue: type ↔ action_type 보완
 *
 * v2 payload (overview 존재)에만 강하게 적용.
 * v1 payload (results[] 만)는 구조 검사만 하고 통과.
 */

// ── 줄바꿈 보정 ────────────────────────────────────────────────────────────────

/**
 * 하나의 문자열에서 깨진 줄바꿈을 복원한다.
 *
 * 케이스 A: "hello\\nworld" (이중 이스케이프 → 실제 backslash+n 두 글자)
 *   → 실제 newline 한 글자로 변환
 * 케이스 B: "합니다.nMy Burger" (backslash가 완전히 소실된 경우)
 *   → 마침표/느낌표/물음표 + 'n' + 대문자/한글 패턴을 newline으로 보정
 */
function fixNewlines(s: string): string {
  // A: literal backslash-n (2 chars) → actual newline
  let r = s.replace(/\\n/g, "\n");
  // B: heuristic — sentence-ending punct + 'n' + uppercase/Korean
  r = r.replace(/([.!?。！？])n([A-Z가-힣ㄱ-힣])/g, "$1\n$2");
  return r;
}

/** payload 전체를 재귀적으로 순회하며 문자열 값의 줄바꿈을 보정한다 */
function deepFixStrings(value: unknown): unknown {
  if (typeof value === "string") return fixNewlines(value);
  if (Array.isArray(value)) return value.map(deepFixStrings);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = deepFixStrings(v);
    }
    return result;
  }
  return value;
}

// ── track_breakdown: 객체 → 배열 ───────────────────────────────────────────────

interface TrackBreakdownItem {
  track: string;
  status?: string;
  summary?: string;
  owners?: string[];
  [key: string]: unknown;
}

function normalizeTrackBreakdown(value: unknown): TrackBreakdownItem[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value as TrackBreakdownItem[];

  // 객체 형태: { planning: { status, summary, owners }, development: {...} }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      const v =
        typeof val === "object" && val !== null
          ? (val as Record<string, unknown>)
          : {};
      return {
        ...v,
        track: key, // spread 후에 덮어써서 key가 유지되게
        status: typeof v.status === "string" ? v.status : undefined,
        summary: typeof v.summary === "string" ? v.summary : undefined,
        owners: Array.isArray(v.owners) ? (v.owners as string[]) : [],
      };
    });
  }

  return undefined;
}

// ── schedule_notes: string[] → string ─────────────────────────────────────────

function normalizeScheduleNotes(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const lines = value.filter((v) => typeof v === "string") as string[];
    return lines.join("\n") || undefined;
  }
  return undefined;
}

// ── Workstream 정규화 ─────────────────────────────────────────────────────────

function normalizeWorkstream(ws: unknown): unknown {
  if (typeof ws !== "object" || ws === null) return ws;
  const w = { ...(ws as Record<string, unknown>) };

  // track_breakdown
  if ("track_breakdown" in w) {
    const fixed = normalizeTrackBreakdown(w.track_breakdown);
    w.track_breakdown = fixed !== undefined ? fixed : w.track_breakdown;
  }

  // schedule_notes
  if ("schedule_notes" in w) {
    const fixed = normalizeScheduleNotes(w.schedule_notes);
    if (fixed !== undefined) w.schedule_notes = fixed;
  }

  return w;
}

// ── stale_task: task → task_name ───────────────────────────────────────────────

function normalizeStaleTask(task: unknown): unknown {
  if (typeof task !== "object" || task === null) return task;
  const t = { ...(task as Record<string, unknown>) };

  if (!t.task_name && typeof t.task === "string") {
    t.task_name = t.task;
  }

  return t;
}

// ── team: team → team_name ────────────────────────────────────────────────────

function normalizeTeam(team: unknown): unknown {
  if (typeof team !== "object" || team === null) return team;
  const t = { ...(team as Record<string, unknown>) };

  if (!t.team_name && typeof t.team === "string") {
    t.team_name = t.team;
  }

  return t;
}

// ── confirmation_queue: type ↔ action_type 보완 ────────────────────────────────

function normalizeConfirmationItem(item: unknown): unknown {
  if (typeof item !== "object" || item === null) return item;
  const i = { ...(item as Record<string, unknown>) };

  if (!i.type && i.action_type) i.type = i.action_type;
  if (!i.action_type && i.type) i.action_type = i.type;

  return i;
}

// ── project_progress 배열 정규화 ──────────────────────────────────────────────

function normalizeProjectProgress(pp: unknown): unknown {
  if (typeof pp !== "object" || pp === null) return pp;
  const p = { ...(pp as Record<string, unknown>) };

  // workstreams
  if (Array.isArray(p.workstreams)) {
    p.workstreams = p.workstreams.map(normalizeWorkstream);
  }

  // stale_tasks
  if (Array.isArray(p.stale_tasks)) {
    p.stale_tasks = p.stale_tasks.map(normalizeStaleTask);
  }

  // confirmation_queue
  if (Array.isArray(p.confirmation_queue)) {
    p.confirmation_queue = p.confirmation_queue.map(normalizeConfirmationItem);
  }

  // schedule_notes at project level
  if ("schedule_notes" in p) {
    const fixed = normalizeScheduleNotes(p.schedule_notes);
    if (fixed !== undefined) p.schedule_notes = fixed;
  }

  return p;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface NormalizeResult {
  normalized: Record<string, unknown>;
  /** 자동으로 수정된 필드 목록 (디버그·warning 표시용) */
  warnings: string[];
}

/**
 * Agent payload를 프론트 타입에 맞게 정규화한다.
 *
 * v2 payload (overview 존재) 전용으로 강한 보정을 적용한다.
 * v1 payload는 줄바꿈 보정만 적용한다.
 */
export function normalizeDashboardPayload(
  payload: Record<string, unknown>
): NormalizeResult {
  const warnings: string[] = [];

  const isV2 =
    "overview" in payload &&
    typeof payload.overview === "object" &&
    payload.overview !== null;

  // ── 1. 전체 줄바꿈 보정 (v1/v2 공통) ─────────────────────────────────────
  const afterNewlines = deepFixStrings(payload) as Record<string, unknown>;

  if (!isV2) {
    return { normalized: afterNewlines, warnings };
  }

  // ── 이하 V2 전용 ─────────────────────────────────────────────────────────

  let result = { ...afterNewlines };

  // ── 2. project_progress ───────────────────────────────────────────────────
  if ("project_progress" in result) {
    if (Array.isArray(result.project_progress)) {
      result.project_progress = result.project_progress.map(normalizeProjectProgress);
    } else if (
      result.project_progress !== null &&
      result.project_progress !== undefined
    ) {
      warnings.push(
        `project_progress was ${typeof result.project_progress} (expected array), discarded`
      );
      result.project_progress = [];
    }
  }

  // ── 3. teams: team → team_name ────────────────────────────────────────────
  if (Array.isArray(result.teams)) {
    const before = result.teams.map(
      (t) =>
        typeof t === "object" && t !== null && !("team_name" in t) && "team" in t
    );
    result.teams = result.teams.map(normalizeTeam);
    if (before.some(Boolean)) {
      warnings.push("teams[].team → team_name field renamed");
    }
  }

  // ── 4. top-level confirmation_queue ──────────────────────────────────────
  if (Array.isArray(result.confirmation_queue)) {
    result.confirmation_queue = result.confirmation_queue.map(
      normalizeConfirmationItem
    );
  }

  // ── 5. overview.confirmation_queue ────────────────────────────────────────
  if (
    typeof result.overview === "object" &&
    result.overview !== null &&
    Array.isArray((result.overview as Record<string, unknown>).confirmation_queue)
  ) {
    const ov = result.overview as Record<string, unknown>;
    result.overview = {
      ...ov,
      confirmation_queue: (
        ov.confirmation_queue as unknown[]
      ).map(normalizeConfirmationItem),
    };
  }

  return { normalized: result, warnings };
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * normalize 이후 payload 최소 유효성 검사.
 *
 * 규칙:
 * - overview 있으면 객체여야 함
 * - project_progress 있으면 배열이어야 함 (비어 있는 건 허용 — warning 처리)
 * - results 있으면 배열이어야 함
 * - overview도 results[]도 없으면 실패
 */
export function validateDashboardPayload(
  payload: unknown
): { ok: true; warnings: string[] } | { ok: false; error: string } {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "payload is not an object" };
  }

  const p = payload as Record<string, unknown>;
  const postWarnings: string[] = [];

  const hasOverview =
    "overview" in p &&
    typeof p.overview === "object" &&
    p.overview !== null;

  const hasResultsArray = "results" in p && Array.isArray(p.results);

  // at least one of overview / results[] required
  if (!hasOverview && !hasResultsArray) {
    return {
      ok: false,
      error: "payload has neither overview (v2) nor results[] (v1)",
    };
  }

  if (hasOverview) {
    // project_progress — if present, must be array
    if (
      "project_progress" in p &&
      p.project_progress !== null &&
      p.project_progress !== undefined &&
      !Array.isArray(p.project_progress)
    ) {
      return {
        ok: false,
        error: `project_progress must be an array, got ${typeof p.project_progress}`,
      };
    }

    // project_progress missing → warn only
    if (!("project_progress" in p) || !Array.isArray(p.project_progress)) {
      postWarnings.push("project_progress missing or empty (rawTasks fallback will be used)");
    }
  }

  // results present but not array
  if ("results" in p && !Array.isArray(p.results)) {
    return {
      ok: false,
      error: `results must be an array, got ${typeof p.results}`,
    };
  }

  return { ok: true, warnings: postWarnings };
}
