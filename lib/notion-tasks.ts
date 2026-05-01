/**
 * Notion `😃 팀 작업 현황` DB를 직접 조회해 DashboardTask[]를 반환한다.
 *
 * 환경변수:
 *   NOTION_TOKEN               — Notion API 토큰
 *   NOTION_TASK_DATABASE_ID    — `😃 팀 작업 현황` DB ID
 */

import { normalizeOwners } from "./normalize";
import type {
  OverviewMetrics,
  ProjectStatus,
  TeamStatus,
  OwnerStatus,
  StatusLevel,
} from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_TASKS = 500;

function maskId(id?: string): string {
  if (!id) return "missing";
  return `${id.slice(0, 8)}...${id.slice(-6)} len=${id.length}`;
}

// database_id 정규화 — UUID ↔ 32자 hex 변환용. data source ID를 database ID로 바꾸는 용도가 아님.
export function normalizeNotionId(id?: string): string {
  if (!id) return "";
  const clean = id.trim();
  const match = clean.match(/[a-f0-9]{32}/i);
  if (match) return match[0];
  return clean.replace(/-/g, "");
}

// ── Notion property value shapes ─────────────────────────────────────────────

type PropValue = Record<string, unknown>;

function propStr(prop: PropValue | undefined, key: string): string[] {
  if (!prop) return [];
  switch (prop.type) {
    case "title":
    case "rich_text": {
      const arr = (prop[prop.type as string] as Array<{ plain_text?: string }>) ?? [];
      return [arr.map((b) => b.plain_text ?? "").join("").trim()].filter(Boolean);
    }
    case "select":
    case "status": {
      const name = ((prop[prop.type as string] as { name?: string }) ?? {}).name;
      return name ? [name.trim()] : [];
    }
    case "multi_select": {
      return ((prop.multi_select as Array<{ name?: string }>) ?? [])
        .map((s) => s.name?.trim() ?? "")
        .filter(Boolean);
    }
    case "url": {
      const u = prop.url as string | null;
      return u ? [u] : [];
    }
    case "email": {
      const e = prop.email as string | null;
      return e ? [e] : [];
    }
    case "phone_number": {
      const p = prop.phone_number as string | null;
      return p ? [p] : [];
    }
    case "number": {
      const n = prop.number as number | null;
      return n !== null && n !== undefined ? [String(n)] : [];
    }
    case "formula": {
      const f = prop.formula as { type?: string; string?: string; number?: number };
      if (f?.type === "string" && f.string) return [f.string];
      if (f?.type === "number" && f.number !== undefined) return [String(f.number)];
      return [];
    }
    default:
      return [];
  }
  void key;
}

function propDate(prop: PropValue | undefined): { start?: string; end?: string } {
  if (!prop || prop.type !== "date") return {};
  const d = prop.date as { start?: string; end?: string } | null;
  return d ?? {};
}

function propPeople(prop: PropValue | undefined): string[] {
  if (!prop || prop.type !== "people") return [];
  const people = (prop.people as Array<{ name?: string; id?: string }>) ?? [];
  return people.map((p) => p.name?.trim() ?? "").filter(Boolean);
}

function propRelationIds(prop: PropValue | undefined): string[] {
  if (!prop || prop.type !== "relation") return [];
  const rel = (prop.relation as Array<{ id?: string }>) ?? [];
  return rel.map((r) => r.id ?? "").filter(Boolean);
}

// ── Status classification ─────────────────────────────────────────────────────

const DONE_KEYWORDS = ["완료", "done", "closed", "취소", "canceled", "cancelled", "completed", "종료"];
const ACTIVE_KEYWORDS = ["진행 중", "진행중", "in progress", "active", "진행", "🔄", "작업 중", "작업중"];

function isDoneStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return DONE_KEYWORDS.some((k) => s === k || s === k.toLowerCase());
}

function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return ACTIVE_KEYWORDS.some((k) => s === k || s.includes(k));
}

function isOverdue(deadline: string | null, isDone: boolean): boolean {
  if (isDone || !deadline) return false;
  return new Date(deadline) < new Date();
}

function isDueSoon(deadline: string | null, isDone: boolean, days = 3): boolean {
  if (isDone || !deadline) return false;
  const d = new Date(deadline);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff >= 0 && diff < days * 24 * 60 * 60 * 1000;
}

// ── DashboardTask ─────────────────────────────────────────────────────────────

export interface DashboardTask {
  id: string;
  task_name: string;
  project: string;
  team: string;
  owner: string;
  owners: string[];
  status: string;
  priority: string;
  sprint: string;
  date_range: string | null;
  deadline: string | null;
  document_link: string | null;
  parent_task_id: string | null;
  child_task_ids: string[];
  last_edited_time: string;
  url: string;
  // computed flags
  is_done: boolean;
  is_active: boolean;
  is_overdue: boolean;
  is_due_soon: boolean;
}

// Notion 프로퍼티 이름 후보 (한국어/영어 모두 지원)
const PROP_CANDIDATES = {
  task_name:    ["작업", "이름", "Name", "Title", "제목", "Task", "작업명"],
  project:      ["프로젝트", "Project", "PJ", "프로젝트명"],
  team:         ["팀", "Team", "부서", "소속"],
  assignee:     ["담당자", "담당", "Assignee", "Assign", "Person"],
  status:       ["상태", "Status", "State", "진행상태"],
  priority:     ["우선순위", "Priority", "중요도"],
  sprint:       ["Sprint", "스프린트"],
  date_range:   ["시작날짜 <-> Dead Line", "시작날짜 <-> Deadline", "날짜", "Date", "기간", "마감일", "Due Date", "Deadline", "기한"],
  doc_link:     ["문서 링크", "문서", "링크", "URL", "Doc", "Document"],
  parent_task:  ["상위 항목", "Parent", "상위"],
  child_tasks:  ["하위 항목", "Children", "하위"],
};

function findProp(
  props: Record<string, PropValue>,
  candidates: string[]
): PropValue | undefined {
  for (const name of candidates) {
    const key = Object.keys(props).find(
      (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (key !== undefined) return props[key];
  }
  return undefined;
}

function normalizePage(page: {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, PropValue>;
}): DashboardTask {
  const p = page.properties;

  const taskNameVals = propStr(findProp(p, PROP_CANDIDATES.task_name), "task_name");
  const projectVals  = propStr(findProp(p, PROP_CANDIDATES.project), "project");
  const teamVals     = propStr(findProp(p, PROP_CANDIDATES.team), "team");
  const statusVals   = propStr(findProp(p, PROP_CANDIDATES.status), "status");
  const priorityVals = propStr(findProp(p, PROP_CANDIDATES.priority), "priority");
  const sprintVals   = propStr(findProp(p, PROP_CANDIDATES.sprint), "sprint");
  const docVals      = propStr(findProp(p, PROP_CANDIDATES.doc_link), "doc_link");

  // People property for assignee
  const peopleProp = findProp(p, PROP_CANDIDATES.assignee);
  const peopleOwners = propPeople(peopleProp);
  // Fallback: rich_text assignee
  const textOwner = peopleOwners.length === 0
    ? propStr(peopleProp, "assignee")[0] ?? ""
    : "";
  const owners = peopleOwners.length
    ? peopleOwners
    : normalizeOwners(undefined, textOwner);

  // Date range
  const dateProp = propDate(findProp(p, PROP_CANDIDATES.date_range));
  const dateRange = dateProp.start || dateProp.end
    ? `${dateProp.start ?? "?"}${dateProp.end ? ` ~ ${dateProp.end}` : ""}`
    : null;
  const deadline = dateProp.end ?? dateProp.start ?? null;

  // Relations
  const parentProp = findProp(p, PROP_CANDIDATES.parent_task);
  const childProp  = findProp(p, PROP_CANDIDATES.child_tasks);

  const status    = statusVals[0] ?? "미기록";
  const taskName  = taskNameVals[0] ?? "이름 없는 작업";
  const project   = projectVals[0] ?? "미기록 프로젝트";
  const team      = teamVals[0] ?? "미분류";
  const done      = isDoneStatus(status);
  const active    = !done && isActiveStatus(status);

  return {
    id:               page.id,
    task_name:        taskName,
    project,
    team,
    owner:            owners[0] ?? "미기록 담당자",
    owners,
    status,
    priority:         priorityVals[0] ?? "미기록",
    sprint:           sprintVals[0] ?? "",
    date_range:       dateRange,
    deadline,
    document_link:    docVals[0] ?? null,
    parent_task_id:   propRelationIds(parentProp)[0] ?? null,
    child_task_ids:   propRelationIds(childProp),
    last_edited_time: page.last_edited_time,
    url:              page.url,
    is_done:          done,
    is_active:        active,
    is_overdue:       isOverdue(deadline, done),
    is_due_soon:      isDueSoon(deadline, done),
  };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function getTasksFromNotion(lookbackDays = 30): Promise<DashboardTask[]> {
  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_TASK_DATABASE_ID;

  console.info("[notion env]", {
    taskDatabaseId:    maskId(process.env.NOTION_TASK_DATABASE_ID),
    taskDataSourceId:  maskId(process.env.NOTION_TASK_DATA_SOURCE_ID),
    summaryDatabaseId: maskId(process.env.NOTION_WORK_STATUS_SUMMARY_DATABASE_ID),
    projectDatabaseId: maskId(process.env.NOTION_PROJECT_DATABASE_ID),
  });
  console.info("[rawTasks notion query]", {
    queryMode: "database_id",
    usingId:   maskId(process.env.NOTION_TASK_DATABASE_ID),
  });

  if (!dbId) throw new Error("env_missing: NOTION_TASK_DATABASE_ID가 설정되지 않았습니다.");
  if (!token) throw new Error("token_missing: NOTION_TOKEN이 설정되지 않았습니다.");

  const allTasks: DashboardTask[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore && allTasks.length < MAX_TASKS) {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    };
    if (cursor) body.start_cursor = cursor;

    let res: Response;
    try {
      res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
        method: "POST",
        headers: {
          Authorization:    `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type":   "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (err) {
      if (allTasks.length === 0) throw new Error(`네트워크 오류: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const snippet = text.slice(0, 120);
      if (allTasks.length === 0) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`permission denied (${res.status}): Notion Integration이 DB에 접근할 수 없습니다. ${snippet}`);
        }
        if (res.status === 404) {
          throw new Error(`query failed (404): NOTION_TASK_DATABASE_ID를 확인하세요. ${snippet}`);
        }
        throw new Error(`query failed (${res.status}): ${snippet}`);
      }
      console.error(`[notion-tasks] API ${res.status}:`, snippet);
      break;
    }

    const json = (await res.json()) as {
      results: Array<{ id: string; url: string; last_edited_time: string; object: string; properties: Record<string, PropValue> }>;
      has_more: boolean;
      next_cursor?: string | null;
    };

    for (const page of json.results) {
      if (page.object === "page" && page.properties) {
        try {
          allTasks.push(normalizePage(page));
        } catch (e) {
          console.warn("[notion-tasks] page normalize error:", e);
        }
      }
    }

    hasMore = json.has_more && !!json.next_cursor;
    cursor = json.next_cursor ?? undefined;
  }

  // 미완료 작업은 항상 포함, 완료된 작업은 lookbackDays 이내 수정된 것만 포함
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  return allTasks.filter(
    (t) => !t.is_done || new Date(t.last_edited_time) >= cutoff
  );
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

export function calcKPI(tasks: DashboardTask[]): OverviewMetrics {
  const total     = tasks.length;
  const active    = tasks.filter((t) => t.is_active).length;
  const done      = tasks.filter((t) => t.is_done).length;
  const planned   = tasks.filter((t) => !t.is_done && !t.is_active).length;
  const overdue   = tasks.filter((t) => t.is_overdue).length;
  const dueSoon   = tasks.filter((t) => t.is_due_soon).length;
  const high      = tasks.filter((t) => t.priority === "0순위" || t.priority === "1순위").length;

  return {
    total_tasks:           total,
    active_tasks:          active,
    planned_tasks:         planned,
    completed_tasks:       done,
    due_soon_tasks:        dueSoon,
    overdue_tasks:         overdue,
    high_priority_tasks:   high,
  };
}

function projectStatus(tasks: DashboardTask[], agentStatus?: StatusLevel): StatusLevel {
  if (agentStatus) return agentStatus;
  if (tasks.some((t) => t.is_overdue))  return "risk";
  if (tasks.some((t) => t.is_due_soon)) return "watch";
  if (tasks.every((t) => t.is_done))    return "normal";
  return "normal";
}

export function buildProjects(
  tasks: DashboardTask[],
  agentProjects: ProjectStatus[] = []
): ProjectStatus[] {
  const groups = new Map<string, DashboardTask[]>();
  for (const t of tasks) {
    const key = t.project;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const agentByName = new Map(agentProjects.map((p) => [p.project_name, p]));

  return Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, ptasks]) => {
      const agent = agentByName.get(name);
      return {
        project_name:      name,
        status:            projectStatus(ptasks, agent?.status),
        metrics: {
          total_tasks:      ptasks.length,
          active_tasks:     ptasks.filter((t) => t.is_active).length,
          completed_tasks:  ptasks.filter((t) => t.is_done).length,
          due_soon_tasks:   ptasks.filter((t) => t.is_due_soon).length,
          overdue_tasks:    ptasks.filter((t) => t.is_overdue).length,
        },
        summary:            agent?.summary,
        key_bottlenecks:    agent?.key_bottlenecks,
        attention_items:    agent?.attention_items,
        slack_signals:      agent?.slack_signals,
      };
    });
}

export function buildTeams(
  tasks: DashboardTask[],
  agentTeams: TeamStatus[] = []
): TeamStatus[] {
  const groups = new Map<string, DashboardTask[]>();
  for (const t of tasks) {
    const key = t.team;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const agentByName = new Map(agentTeams.map((t) => [t.team_name, t]));

  return Array.from(groups.entries()).map(([team_name, ttasks]) => {
    const agent = agentByName.get(team_name);
    const overdue = ttasks.filter((t) => t.is_overdue).length;
    const active  = ttasks.filter((t) => t.is_active).length;
    const done    = ttasks.filter((t) => t.is_done).length;
    const rawStatus: StatusLevel =
      overdue > ttasks.length * 0.3 ? "risk" :
      overdue > 0                   ? "watch" : "normal";

    return {
      team_name,
      status:           agent?.status ?? rawStatus,
      summary:          agent?.summary,
      metrics: {
        "전체":  ttasks.length,
        "진행":  active,
        "완료":  done,
        "초과":  overdue,
      },
      attention_items:  agent?.attention_items,
    };
  });
}

export function buildOwners(
  tasks: DashboardTask[],
  agentOwners: OwnerStatus[] = []
): OwnerStatus[] {
  const groups = new Map<string, DashboardTask[]>();
  for (const t of tasks) {
    const ownerList = t.owners.length ? t.owners : [t.owner];
    for (const owner of ownerList) {
      if (!owner || owner === "미기록 담당자") continue;
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner)!.push(t);
    }
  }

  const agentByName = new Map(agentOwners.map((o) => [o.owner, o]));

  return Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([owner, otasks]) => {
      const agent = agentByName.get(owner);
      const overdue = otasks.filter((t) => t.is_overdue).length;
      const active  = otasks.filter((t) => t.is_active).length;
      const rawStatus: StatusLevel =
        overdue > otasks.length * 0.3 ? "risk" :
        overdue > 0                   ? "watch" : "normal";

      return {
        owner,
        status:         agent?.status ?? rawStatus,
        summary:        agent?.summary,
        metrics: {
          "전체": otasks.length,
          "진행": active,
          "초과": overdue,
        },
        notable_load: agent?.notable_load,
      };
    });
}
