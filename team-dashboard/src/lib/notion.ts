import type {
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function notionFetch(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion API ${res.status}: ${err.message || res.statusText}`);
  }
  return res.json();
}

export interface WorkItem {
  id: string;
  title: string;
  status: string;
  assignee: string;
  team: string;
  project: string;
  dueDate: string | null;
  priority: string;
  sprint: string;
  lastEdited: string;
  url: string;
}

export interface DashboardData {
  items: WorkItem[];
  teams: string[];
  projects: string[];
  assignees: string[];
  sprints: string[];
  lastUpdated: string;
}

// Notion 속성에서 텍스트 추출
function extractText(property: PageObjectResponse["properties"][string]): string {
  switch (property.type) {
    case "title":
      return property.title.map((t) => t.plain_text).join("") || "";
    case "rich_text":
      return property.rich_text.map((t) => t.plain_text).join("") || "";
    case "select":
      return property.select?.name || "";
    case "multi_select":
      return property.multi_select.map((s) => s.name).join(", ") || "";
    case "status":
      return property.status?.name || "";
    case "people":
      return property.people.map((p) => ("name" in p ? p.name : "")).join(", ") || "";
    case "date":
      return property.date?.start || "";
    case "number":
      return property.number?.toString() || "";
    case "checkbox":
      return property.checkbox ? "Yes" : "No";
    case "url":
      return property.url || "";
    case "email":
      return property.email || "";
    case "formula":
      if (property.formula.type === "string") return property.formula.string || "";
      if (property.formula.type === "number") return property.formula.number?.toString() || "";
      if (property.formula.type === "boolean") return property.formula.boolean ? "Yes" : "No";
      if (property.formula.type === "date") return property.formula.date?.start || "";
      return "";
    case "rollup":
      if (property.rollup.type === "number") return property.rollup.number?.toString() || "";
      if (property.rollup.type === "array")
        return property.rollup.array.map((item) => extractText(item as PageObjectResponse["properties"][string])).join(", ");
      return "";
    default:
      return "";
  }
}

// 속성 이름 자동 매칭 (한국어/영어 모두 지원)
function findProperty(
  properties: PageObjectResponse["properties"],
  candidates: string[]
): PageObjectResponse["properties"][string] | null {
  for (const name of candidates) {
    const key = Object.keys(properties).find(
      (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (key !== undefined) return properties[key];
  }
  return null;
}

function parseWorkItem(
  page: PageObjectResponse,
  dbName: string
): WorkItem {
  const props = page.properties;

  const titleProp = findProperty(props, ["이름", "제목", "Name", "Title", "작업", "Task", "작업명"]);
  const statusProp = findProperty(props, ["상태", "Status", "진행상태", "진행 상태", "State"]);
  const assigneeProp = findProperty(props, ["담당자", "담당", "Assignee", "Assign", "Person", "사람"]);
  const teamProp = findProperty(props, ["팀", "Team", "부서", "Department", "소속"]);
  const projectProp = findProperty(props, ["프로젝트", "Project", "PJ", "프로젝트명", ""]);
  const dueProp = findProperty(props, ["마감일", "마감", "Due", "Due Date", "Deadline", "기한", "날짜", "시작날짜 <-> Dead Line", "시작날짜 <-> Deadline"]);
  const priorityProp = findProperty(props, ["우선순위", "Priority", "중요도", "Importance"]);
  const sprintProp = findProperty(props, ["Sprint", "스프린트", "sprint"]);

  const title = titleProp ? extractText(titleProp) : "제목 없음";
  const status = statusProp ? extractText(statusProp) : "미지정";
  const assignee = assigneeProp ? extractText(assigneeProp) : "미지정";
  const team = teamProp ? extractText(teamProp) : inferTeamFromDB(dbName);
  const rawProject = projectProp ? extractText(projectProp) : "";
  const project = rawProject || "미분류";
  const dueDate = dueProp ? extractText(dueProp) : null;
  const priority = priorityProp ? extractText(priorityProp) : "보통";
  const sprint = sprintProp ? extractText(sprintProp) : "";

  return {
    id: page.id,
    title,
    status,
    assignee,
    team,
    project,
    dueDate,
    priority,
    sprint,
    lastEdited: page.last_edited_time,
    url: page.url,
  };
}

function inferTeamFromDB(dbName: string): string {
  const teamKeywords: Record<string, string> = {
    기획: "기획팀",
    플래닝: "기획팀",
    planning: "기획팀",
    개발: "개발팀",
    dev: "개발팀",
    develop: "개발팀",
    engineering: "개발팀",
    아트: "아트팀",
    art: "아트팀",
    디자인: "아트팀",
    design: "아트팀",
  };
  const lower = dbName.toLowerCase();
  for (const [keyword, team] of Object.entries(teamKeywords)) {
    if (lower.includes(keyword)) return team;
  }
  return "미분류";
}

function inferProjectFromDB(dbName: string): string {
  return dbName.replace(/[_\-](기획|개발|아트|dev|art|planning|task|작업|업무)/gi, "").trim() || "기타";
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const dbIds = (process.env.NOTION_DATABASE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (dbIds.length === 0) {
    return {
      items: [],
      teams: [],
      projects: [],
      assignees: [],
      sprints: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  const allItems: WorkItem[] = [];

  for (const dbId of dbIds) {
    try {
      // DB 메타 정보로 이름 가져오기 (v2022-06-28 호환)
      const dbInfo = await notionFetch(`/databases/${dbId}`);
      const dbName = (dbInfo.title || []).map((t: { plain_text: string }) => t.plain_text).join("") || "Unnamed";

      // 페이지 목록 가져오기
      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore) {
        const queryBody: Record<string, unknown> = { page_size: 100 };
        if (startCursor) queryBody.start_cursor = startCursor;

        const response = await notionFetch(`/databases/${dbId}/query`, queryBody);

        for (const page of response.results) {
          if (page.object === "page" && "properties" in page) {
            allItems.push(parseWorkItem(page as PageObjectResponse, dbName));
          }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor ?? undefined;
      }
    } catch (error) {
      console.error(`DB ${dbId} 조회 실패:`, error);
    }
  }

  const teams = [...new Set(allItems.map((i) => i.team))].sort();
  const projects = [...new Set(allItems.map((i) => i.project))].sort();
  const assignees = [...new Set(allItems.map((i) => i.assignee))].filter((a) => a !== "미지정").sort();
  const sprints = [...new Set(allItems.map((i) => i.sprint))].filter(Boolean).sort();

  return {
    items: allItems,
    teams,
    projects,
    assignees,
    sprints,
    lastUpdated: new Date().toISOString(),
  };
}
