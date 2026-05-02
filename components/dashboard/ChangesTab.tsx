"use client";

import type {
  Trend,
  AttentionItemV2,
  TrendProjectChange,
  TrendStatusChange,
} from "@/lib/types";

// ── 헬퍼 타입 ─────────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;
type AnyItem = AttentionItemV2 | string | AnyRecord;

// ── 텍스트 추출 ───────────────────────────────────────────────────────────────

function itemText(item: AnyItem): string {
  if (typeof item === "string") return item.trim();
  const o = item as AnyRecord;
  const direct = String(
    o.item ?? o.title ?? o.summary ?? o.task_name ?? o.project ?? ""
  ).trim();
  if (direct) return direct;
  return [o.project, o.reason].filter(Boolean).map(String).join(" — ").trim();
}

function itemReason(item: AnyItem): string | null {
  if (typeof item === "string") return null;
  const o = item as AnyRecord;
  const r = String(o.reason ?? o.why ?? o.evidence ?? "").trim();
  return r || null;
}

// ── 상태 심각도 ───────────────────────────────────────────────────────────────

const SEVERITY: Record<string, number> = {
  normal: 0, watch: 1, risk: 2, blocked: 3,
};

function sev(s: string) {
  return SEVERITY[s?.toLowerCase()] ?? 1;
}

function isWorsened(prev: string, curr: string, change?: string): boolean {
  if (change === "worsened") return true;
  if (change === "improved" || change === "stable") return false;
  return sev(curr) > sev(prev);
}

function isImproved(prev: string, curr: string, change?: string): boolean {
  if (change === "improved") return true;
  if (change === "worsened" || change === "stable") return false;
  return sev(curr) < sev(prev);
}

// ── 상태 배지 ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  normal: "정상", watch: "주의", risk: "위험", blocked: "막힘",
};

const STATUS_CLS: Record<string, string> = {
  normal:  "bg-green-100 text-green-700",
  watch:   "bg-yellow-100 text-yellow-700",
  risk:    "bg-orange-100 text-orange-700",
  blocked: "bg-red-100 text-red-700",
};

function StatusChip({ status }: { status: string }) {
  const s = status?.toLowerCase();
  return (
    <span className={`inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded ${STATUS_CLS[s] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABEL[s] ?? status}
    </span>
  );
}

// ── 요약 카드 행 ──────────────────────────────────────────────────────────────

interface SummaryCount {
  label: string;
  count: number;
  activeCls: string;
  inactiveCls: string;
}

function SummaryBar({
  counts,
  previousRunId,
  previousDate,
}: {
  counts: SummaryCount[];
  previousRunId?: string;
  previousDate?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {counts.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5">
            <span
              className={`text-lg font-bold ${c.count > 0 ? c.activeCls : "text-gray-300"}`}
            >
              {c.count}
            </span>
            <span className="text-xs text-gray-500">{c.label}</span>
          </div>
        ))}
        {(previousRunId || previousDate) && (
          <div className="ml-auto text-xs text-gray-400">
            이전 실행:{" "}
            <span className="font-mono text-gray-500">
              {previousDate ?? previousRunId}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 섹션 래퍼 ─────────────────────────────────────────────────────────────────

function ChangeSection({
  title,
  count,
  headerCls,
  children,
}: {
  title: string;
  count: number;
  headerCls: string;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <section>
      <h2 className={`text-xs font-bold uppercase tracking-widest mb-3 ${headerCls}`}>
        {title} ({count})
      </h2>
      {children}
    </section>
  );
}

// ── 프로젝트 상태 변화 행 ─────────────────────────────────────────────────────

function ProjectChangeRow({
  c,
  direction,
}: {
  c: TrendProjectChange;
  direction: "worsened" | "improved" | "stable";
}) {
  const bgCls =
    direction === "worsened"
      ? "bg-red-50 border-red-100"
      : direction === "improved"
      ? "bg-green-50 border-green-100"
      : "bg-gray-50 border-gray-100";

  const arrow =
    direction === "worsened" ? "↗" : direction === "improved" ? "↘" : "→";
  const arrowCls =
    direction === "worsened"
      ? "text-red-500"
      : direction === "improved"
      ? "text-green-500"
      : "text-gray-400";

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${bgCls}`}>
      <span className={`text-base font-bold ${arrowCls}`}>{arrow}</span>
      <span className="text-sm font-semibold text-gray-800 flex-1">{c.project}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusChip status={c.previous_status} />
        <span className="text-gray-400 text-xs">→</span>
        <StatusChip status={c.current_status} />
      </div>
    </div>
  );
}

// ── status_changes (비 프로젝트) 행 ──────────────────────────────────────────

function StatusChangeRow({ c }: { c: TrendStatusChange | string }) {
  if (typeof c === "string") {
    return (
      <div className="flex items-start gap-2 text-xs">
        <span className="text-blue-500 shrink-0 mt-0.5">•</span>
        <span className="text-gray-700">{c}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
      <span className="text-sm font-semibold text-gray-800 flex-1">{c.target}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusChip status={c.from} />
        <span className="text-gray-400 text-xs">→</span>
        <StatusChip status={c.to} />
      </div>
    </div>
  );
}

// ── 주의 항목 카드 ────────────────────────────────────────────────────────────

function AttentionCard({
  item,
  iconCls,
  bgCls,
  strikethrough,
}: {
  item: AnyItem;
  iconCls: string;
  bgCls: string;
  strikethrough?: boolean;
}) {
  const text   = itemText(item);
  const reason = itemReason(item);
  if (!text) return null;

  const o = typeof item === "object" ? (item as AnyRecord) : null;
  const project = o && String(o.project ?? "").trim();
  const urgency = o && String(o.urgency ?? "").trim();

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bgCls}`}>
      <div className="flex flex-wrap items-start gap-2">
        {project && (
          <span className="text-xs font-semibold text-gray-500">{project}</span>
        )}
        {urgency && urgency !== "medium" && (
          <span className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded ${iconCls} bg-opacity-20`}>
            {urgency === "critical" ? "긴급" : urgency === "high" ? "높음" : urgency === "low" ? "낮음" : urgency}
          </span>
        )}
      </div>
      <p className={`text-sm text-gray-800 leading-snug mt-0.5 ${strikethrough ? "line-through text-gray-400" : ""}`}>
        {text}
      </p>
      {reason && !strikethrough && (
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">{reason}</p>
      )}
    </div>
  );
}

// ── 반복 리스크 카드 ──────────────────────────────────────────────────────────

function RepeatedRiskCard({ item }: { item: string | AnyRecord }) {
  const text   = typeof item === "string" ? item.trim() : itemText(item);
  const reason = typeof item === "string" ? null : itemReason(item);
  if (!text) return null;

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="text-purple-500 shrink-0 mt-0.5 text-sm font-bold">⚠</span>
        <div>
          <p className="text-sm text-gray-800 font-semibold leading-snug">{text}</p>
          {reason && (
            <p className="mt-0.5 text-xs text-purple-700 leading-relaxed">{reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  reason,
  previousRunId,
  previousDate,
}: {
  reason: "no-data" | "no-changes";
  previousRunId?: string;
  previousDate?: string;
}) {
  return (
    <div className="text-center py-14 text-gray-400 space-y-2">
      <p className="text-3xl">{reason === "no-data" ? "📭" : "✅"}</p>
      <p className="text-sm font-medium text-gray-500">
        {reason === "no-data"
          ? "이전 실행 데이터가 없어 변화를 비교할 수 없습니다."
          : "지난 실행 대비 주요 변화가 없습니다."}
      </p>
      {reason === "no-data" && (
        <p className="text-xs text-gray-400">
          Agent가 trend 필드를 포함하면 변화 내역이 표시됩니다.
        </p>
      )}
      {reason === "no-changes" && (previousRunId || previousDate) && (
        <p className="text-xs font-mono text-gray-400">
          이전 실행: {previousDate ?? previousRunId}
        </p>
      )}
    </div>
  );
}

// ── ChangesTab ────────────────────────────────────────────────────────────────

export function ChangesTab({ trend }: { trend?: Trend }) {
  // ── 데이터 없음 ────────────────────────────────────────────────────────────
  if (!trend) {
    return <EmptyState reason="no-data" />;
  }

  // ── 필드 파싱 ──────────────────────────────────────────────────────────────
  const newItems    = (trend.new_attention_items          ?? []) as AnyItem[];
  const carried     = (trend.carried_over_attention_items ?? []) as AnyItem[];
  const resolved    = (trend.resolved_attention_items     ?? []) as AnyItem[];
  const repeatedRaw = (trend.repeated_risks               ?? []) as (string | AnyRecord)[];

  const projectChanges = Array.isArray(trend.project_changes) ? trend.project_changes : [];
  const statusChanges  = Array.isArray(trend.status_changes)
    ? (trend.status_changes as (TrendStatusChange | string)[])
    : [];

  // 프로젝트 변화 분류
  const worsenedProjects = projectChanges.filter((c) =>
    isWorsened(c.previous_status, c.current_status, c.change)
  );
  const improvedProjects = projectChanges.filter((c) =>
    isImproved(c.previous_status, c.current_status, c.change)
  );
  const stableProjects = projectChanges.filter(
    (c) =>
      !isWorsened(c.previous_status, c.current_status, c.change) &&
      !isImproved(c.previous_status, c.current_status, c.change)
  );

  // 텍스트 리스트
  const newTexts      = newItems.map(itemText).filter(Boolean);
  const carriedTexts  = carried.map(itemText).filter(Boolean);
  const resolvedTexts = resolved.map(itemText).filter(Boolean);
  const riskTexts     = repeatedRaw
    .map((r) => (typeof r === "string" ? r.trim() : itemText(r)))
    .filter(Boolean);

  // 전체 상태 변화 (project_changes 제외 — 별도 표시)
  const rawStatusChanges = statusChanges.filter((c) => {
    if (typeof c === "string") return true;
    // project_changes에 이미 있는 project라면 중복 제거
    const projectNames = new Set(projectChanges.map((p) => p.project));
    return !projectNames.has(c.target);
  });

  // 요약 카운트
  const worsenedCount = worsenedProjects.length + rawStatusChanges.filter((c) => {
    if (typeof c === "string") return false;
    return sev(c.to) > sev(c.from);
  }).length;

  const hasAnyContent =
    worsenedProjects.length > 0 ||
    improvedProjects.length > 0 ||
    stableProjects.length > 0 ||
    rawStatusChanges.length > 0 ||
    newTexts.length > 0 ||
    carriedTexts.length > 0 ||
    resolvedTexts.length > 0 ||
    riskTexts.length > 0 ||
    trend.recommended_focus ||
    trend.summary ||
    trend.overall_change;

  if (!hasAnyContent) {
    return (
      <EmptyState
        reason="no-changes"
        previousRunId={trend.previous_run_id}
        previousDate={trend.previous_date}
      />
    );
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* 1. 요약 카드 */}
      <SummaryBar
        counts={[
          { label: "악화",       count: worsenedCount,       activeCls: "text-red-600",    inactiveCls: "text-gray-300" },
          { label: "신규",       count: newTexts.length,     activeCls: "text-orange-600", inactiveCls: "text-gray-300" },
          { label: "지속 리스크", count: carriedTexts.length, activeCls: "text-yellow-600", inactiveCls: "text-gray-300" },
          { label: "해결",       count: resolvedTexts.length, activeCls: "text-green-600",  inactiveCls: "text-gray-300" },
          { label: "반복 리스크", count: riskTexts.length,    activeCls: "text-purple-600", inactiveCls: "text-gray-300" },
        ]}
        previousRunId={trend.previous_run_id}
        previousDate={trend.previous_date}
      />

      {/* 2. 전체 변화 한 줄 요약 */}
      {(trend.overall_change ?? trend.summary) && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">
            전체 변화 요약
          </p>
          <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-line">
            {trend.overall_change ?? trend.summary}
          </p>
        </div>
      )}

      {/* 3. 악화된 항목 */}
      <ChangeSection
        title="악화된 항목"
        count={worsenedProjects.length + rawStatusChanges.filter(c => typeof c !== "string" && sev(c.to) > sev(c.from)).length}
        headerCls="text-red-600"
      >
        <div className="space-y-2">
          {worsenedProjects.map((c, i) => (
            <ProjectChangeRow key={i} c={c} direction="worsened" />
          ))}
          {rawStatusChanges
            .filter((c) => typeof c !== "string" && sev(c.to) > sev(c.from))
            .map((c, i) => (
              <StatusChangeRow key={`s-${i}`} c={c} />
            ))}
        </div>
      </ChangeSection>

      {/* 4. 신규 리스크 */}
      <ChangeSection
        title="신규 리스크"
        count={newTexts.length}
        headerCls="text-orange-600"
      >
        <div className="space-y-2">
          {newItems.map((item, i) =>
            itemText(item) ? (
              <AttentionCard
                key={i}
                item={item}
                iconCls="text-orange-600"
                bgCls="bg-orange-50 border-orange-100"
              />
            ) : null
          )}
        </div>
      </ChangeSection>

      {/* 5. 지속 리스크 */}
      <ChangeSection
        title="지속 리스크"
        count={carriedTexts.length}
        headerCls="text-yellow-600"
      >
        <div className="space-y-2">
          {carried.map((item, i) =>
            itemText(item) ? (
              <AttentionCard
                key={i}
                item={item}
                iconCls="text-yellow-600"
                bgCls="bg-yellow-50 border-yellow-100"
              />
            ) : null
          )}
        </div>
      </ChangeSection>

      {/* 6. 반복 리스크 (강조) */}
      <ChangeSection
        title="반복 리스크"
        count={riskTexts.length}
        headerCls="text-purple-600"
      >
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-2">
          <p className="text-xs text-purple-600 mb-2">
            여러 실행에 걸쳐 반복적으로 나타난 위험입니다. 근본 원인 해소가 필요합니다.
          </p>
          {repeatedRaw.map((r, i) => (
            <RepeatedRiskCard key={i} item={r} />
          ))}
        </div>
      </ChangeSection>

      {/* 7. 해결된 항목 */}
      <ChangeSection
        title="해결된 항목"
        count={resolvedTexts.length + improvedProjects.length}
        headerCls="text-green-600"
      >
        <div className="space-y-2">
          {improvedProjects.map((c, i) => (
            <ProjectChangeRow key={`imp-${i}`} c={c} direction="improved" />
          ))}
          {resolved.map((item, i) =>
            itemText(item) ? (
              <AttentionCard
                key={`res-${i}`}
                item={item}
                iconCls="text-green-600"
                bgCls="bg-green-50 border-green-100"
                strikethrough
              />
            ) : null
          )}
        </div>
      </ChangeSection>

      {/* 8. 우선순위 변화 / 안정 (stable) */}
      {(stableProjects.length > 0 || rawStatusChanges.filter(c => typeof c === "string" || sev(c.to) === sev(c.from)).length > 0) && (
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            상태 유지 ({stableProjects.length})
          </h2>
          <div className="space-y-2">
            {stableProjects.map((c, i) => (
              <ProjectChangeRow key={i} c={c} direction="stable" />
            ))}
            {rawStatusChanges
              .filter((c) => typeof c === "string" || sev(c.to) === sev(c.from))
              .map((c, i) => (
                <StatusChangeRow key={`rs-${i}`} c={c} />
              ))}
          </div>
        </section>
      )}

      {/* 9. 다음 실행에서 볼 것 (recommended_focus) */}
      {trend.recommended_focus && (
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            다음 실행에서 볼 것
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {trend.recommended_focus}
            </p>
          </div>
        </section>
      )}

    </div>
  );
}
