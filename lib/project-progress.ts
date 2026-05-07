/**
 * rawTasks + judgmentPayload로 project_progress fallback을 생성한다.
 * Agent payload에 project_progress가 없을 때만 사용한다.
 */

import type {
  FunctionBreakdownItem,
  OwnerBreakdownItem,
  ProjectProgress,
  ProjectDataHealth,
  SprintStatusItem,
  Workstream,
} from "./types";
import type { DashboardTask } from "./notion-tasks";

// Sprint/Version 패턴 — task_name 또는 sprint 필드에서 추출
const SP_RE      = /SP\s*(\d+)/i;
const VER_RE     = /\bv?(\d+\.\d+(?:\.\d+)?)\b/;
const SPRINT_RE  = /sprint\s*(\d+)/i;

// 키워드 → workstream label 매핑 (task_name 포함 여부)
const KW_LABELS: [RegExp, string][] = [
  [/QA/i,          "QA"],
  [/업로드/,        "업로드 대기"],
  [/리뷰/,          "리뷰"],
  [/기획/,          "기획"],
  [/테스트/,        "테스트"],
  [/CPI/i,          "CPI"],
  [/리밸런싱/,      "리밸런싱"],
  [/파트너/,        "파트너"],
  [/온보딩/,        "온보딩"],
  [/콘테스트/,      "콘테스트"],
  [/출석/,          "출석부"],
  [/딜리버리/,      "딜리버리"],
  [/퀘스트/,        "퀘스트"],
  [/통계/,          "통계"],
];

function extractWorkstreamLabel(task: DashboardTask): string {
  // 1. Sprint 필드 우선
  const sprint = task.sprint?.trim();
  if (sprint) return normalizeSprint(sprint);

  const name = task.task_name;

  // 2. SP 패턴
  const spM = name.match(SP_RE);
  if (spM) return `SP${spM[1]}`;

  // 3. 버전 패턴
  const verM = name.match(VER_RE);
  if (verM) return verM[1];

  // 4. sprint 키워드
  const srM = name.match(SPRINT_RE);
  if (srM) return `Sprint ${srM[1]}`;

  // 5. 도메인 키워드
  for (const [re, label] of KW_LABELS) {
    if (re.test(name)) return label;
  }

  return "기타";
}

function normalizeSprint(s: string): string {
  // "SP 57" → "SP57", "SP57" → "SP57"
  const m = s.match(/SP\s*(\d+)/i);
  return m ? `SP${m[1]}` : s;
}

function workstreamStatus(tasks: DashboardTask[]): string {
  if (tasks.every((t) => t.is_done))  return "완료";
  if (tasks.some((t) => t.is_overdue)) return "지연";
  if (tasks.some((t) => t.is_due_soon)) return "임박";
  if (tasks.some((t) => t.is_active))  return "진행 중";
  return "예정";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildOwnerStatus(tasks: DashboardTask[]): OwnerBreakdownItem[] {
  const ownerMap = new Map<string, DashboardTask[]>();

  for (const task of tasks) {
    const owners = task.owners.length ? task.owners : [task.owner];
    for (const owner of owners.filter(Boolean)) {
      if (!ownerMap.has(owner)) ownerMap.set(owner, []);
      ownerMap.get(owner)!.push(task);
    }
  }

  return Array.from(ownerMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([owner, ownerTasks]) => {
      const activeCount = ownerTasks.filter((task) => !task.is_done).length;
      const overdueCount = ownerTasks.filter((task) => task.is_overdue).length;
      const summary =
        overdueCount > 0
          ? `미완료 ${activeCount}건 · 마감 초과 ${overdueCount}건`
          : `미완료 ${activeCount}건`;

      return {
        owner,
        status:
          overdueCount > 0
            ? "risk"
            : ownerTasks.some((task) => task.is_active)
            ? "normal"
            : undefined,
        summary,
        tasks: ownerTasks.map((task) => task.task_name),
      };
    });
}

function buildSprintStatus(tasks: DashboardTask[]): SprintStatusItem[] {
  const sprintMap = new Map<string, DashboardTask[]>();

  for (const task of tasks) {
    const sprint = extractWorkstreamLabel(task);
    if (!/^SP\d+$/i.test(sprint) && !/^Sprint\s+\d+$/i.test(sprint)) continue;
    if (!sprintMap.has(sprint)) sprintMap.set(sprint, []);
    sprintMap.get(sprint)!.push(task);
  }

  return Array.from(sprintMap.entries())
    .sort(([a], [b]) => sortLabel(a, b))
    .map(([sprint, sprintTasks]) => ({
      sprint,
      status: workstreamStatus(sprintTasks),
      summary: `${sprintTasks.filter((task) => !task.is_done).length}건 미완료`,
      owners: unique(sprintTasks.flatMap((task) => task.owners.length ? task.owners : [task.owner])),
      items: sprintTasks.map((task) => task.task_name),
    }));
}

function buildFunctionStatus(tasks: DashboardTask[]): FunctionBreakdownItem[] {
  return tasks
    .map((task) => ({
      function: task.task_name,
      status: workstreamStatus([task]),
      summary: [task.status, task.deadline ? `마감 ${task.deadline}` : ""]
        .filter(Boolean)
        .join(" · "),
      owners: task.owners.length ? task.owners : [task.owner].filter(Boolean),
      track: task.team,
    }))
    .slice(0, 12);
}

function buildProjectDataHealth(tasks: DashboardTask[]): ProjectDataHealth {
  const overdueCount = tasks.filter((task) => task.is_overdue).length;
  const dueSoonCount = tasks.filter((task) => task.is_due_soon).length;

  return {
    status: overdueCount > 0 ? "low" : dueSoonCount > 0 ? "medium" : "medium",
    notion_task_coverage: tasks.length > 0 ? "strong" : "none",
    owner_mapping: tasks.some((task) => task.owners.length > 0 || task.owner) ? "sufficient" : "none",
    schedule_coverage: tasks.some((task) => task.deadline || task.sprint) ? "sufficient" : "partial",
    conflict_count: 0,
    stale_task_count: 0,
    confidence_score: overdueCount > 0 ? 55 : 70,
    notes: ["원본 작업 기반 최소 요약을 안전하게 표시합니다."],
  };
}

// SP 숫자 기반 정렬 (SP57 < SP58 < ...), 없으면 문자 순
function sortLabel(a: string, b: string): number {
  const na = a.match(/(\d+)/)?.[1];
  const nb = b.match(/(\d+)/)?.[1];
  if (na && nb) return parseInt(na) - parseInt(nb);
  return a.localeCompare(b, "ko");
}

export function buildProjectProgressFallback(
  rawTasks: DashboardTask[]
): ProjectProgress[] {
  if (!rawTasks.length) return [];

  // 완료된 작업은 제외하지 않고 포함 (진행 현황 파악을 위해)
  const projectGroups = new Map<string, DashboardTask[]>();
  for (const t of rawTasks) {
    const key = t.project;
    if (!projectGroups.has(key)) projectGroups.set(key, []);
    projectGroups.get(key)!.push(t);
  }

  const result: ProjectProgress[] = [];

  for (const [project, tasks] of projectGroups) {
    // workstream 그룹핑
    const wsMap = new Map<string, DashboardTask[]>();
    for (const t of tasks) {
      const label = extractWorkstreamLabel(t);
      if (!wsMap.has(label)) wsMap.set(label, []);
      wsMap.get(label)!.push(t);
    }

    const workstreams: Workstream[] = Array.from(wsMap.entries())
      .sort(([a], [b]) => sortLabel(a, b))
      .map(([label, wsTasks]) => ({
        label,
        status: workstreamStatus(wsTasks),
        items: wsTasks
          .filter((t) => !t.is_done || wsTasks.length <= 3)
          .map((t) => t.task_name),
      }))
      .filter((ws) => ws.items && ws.items.length > 0);

    // 마감 초과 / 임박 → needs_confirmation
    const needsConfirm = tasks
      .filter((t) => t.is_overdue || t.is_due_soon)
      .map((t) => ({
        item: t.task_name,
        owner: t.owners[0] ?? t.owner,
        reason: t.is_overdue ? "마감 초과" : "마감 임박",
      }));

    // 진행 중 기준 요약
    const active  = tasks.filter((t) => t.is_active).length;
    const total   = tasks.filter((t) => !t.is_done).length;
    const overdue = tasks.filter((t) => t.is_overdue).length;
    const summary =
      overdue > 0
        ? `미완료 ${total}건 중 ${overdue}건 마감 초과`
        : active > 0
        ? `${active}건 진행 중 / 미완료 ${total}건`
        : `미완료 ${total}건`;

    const ownerStatus = buildOwnerStatus(tasks);
    const sprintStatus = buildSprintStatus(tasks);
    const functionStatus = buildFunctionStatus(tasks);
    const projectDataHealth = buildProjectDataHealth(tasks);

    result.push({
      project,
      current_summary: summary,
      display_summary: summary,
      summary,
      status: overdue > 0 ? "risk" : tasks.some((task) => task.is_due_soon) ? "watch" : "normal",
      workstreams,
      function_status: functionStatus,
      sprint_status: sprintStatus,
      owner_status: ownerStatus,
      needs_confirmation: needsConfirm.length ? needsConfirm : undefined,
      confirmation_queue: needsConfirm.length
        ? needsConfirm.map((item) => ({
            item: item.item,
            owner: item.owner,
            reason: item.reason,
            timing: item.reason === "마감 초과" ? "today" : "this_week",
            owner_status: item.owner ? "assigned" : "unknown",
          }))
        : undefined,
      risks: overdue > 0 ? [`마감 초과 ${overdue}건`] : undefined,
      data_conflicts: [],
      stale_tasks: [],
      project_data_health: projectDataHealth,
    });
  }

  // 리스크 프로젝트 먼저 (초과 > 임박 > 진행 > 정상)
  return result.sort((a, b) => {
    const score = (pp: ProjectProgress) => {
      const nc = pp.needs_confirmation?.length ?? 0;
      const ws = pp.workstreams ?? [];
      if (ws.some((w) => w.status === "지연") || nc > 0) return 0;
      if (ws.some((w) => w.status === "임박"))            return 1;
      if (ws.some((w) => w.status === "진행 중"))         return 2;
      return 3;
    };
    return score(a) - score(b);
  });
}
