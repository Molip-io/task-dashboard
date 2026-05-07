import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDashboardPayload } from "../normalize-dashboard-payload.ts";
import { buildProjectProgressFallback } from "../project-progress.ts";
import type { DashboardTask } from "../notion-tasks.ts";

function makeTask(overrides: Partial<DashboardTask>): DashboardTask {
  return {
    id: "task-1",
    task_name: "SP57 SDK 안정화",
    project: "피자 레디",
    team: "개발",
    owner: "Alice",
    owners: ["Alice"],
    status: "진행 중",
    priority: "높음",
    sprint: "SP57",
    date_range: null,
    deadline: null,
    document_link: null,
    parent_task_id: null,
    child_task_ids: [],
    last_edited_time: "2026-05-05T12:00:00.000Z",
    url: "https://example.com/task-1",
    is_done: false,
    is_active: true,
    is_overdue: false,
    is_due_soon: false,
    ...overrides,
  };
}

test("normalizeDashboardPayload coerces malformed project detail collections", () => {
  const { normalized } = normalizeDashboardPayload({
    overview: {
      metrics: {},
      top_attention_items: [],
    },
    project_progress: [
      {
        project: "피자 레디",
        project_data_health: {
          status: "low",
          notes: "payload parse failed",
        },
        workstreams: null,
        function_status: "invalid",
        sprint_status: { sprint: "SP57" },
        owner_status: null,
        data_conflicts: "invalid",
        stale_tasks: { task_name: "old task" },
        confirmation_queue: { item: "check owner" },
        risks: "invalid",
      },
    ],
  });

  const project = (normalized.project_progress as Array<Record<string, unknown>>)[0];
  const health = project.project_data_health as Record<string, unknown>;

  assert.deepEqual(project.workstreams, []);
  assert.deepEqual(project.function_status, []);
  assert.deepEqual(project.sprint_status, []);
  assert.deepEqual(project.owner_status, []);
  assert.deepEqual(project.data_conflicts, []);
  assert.deepEqual(project.stale_tasks, []);
  assert.deepEqual(project.confirmation_queue, []);
  assert.deepEqual(project.risks, []);
  assert.deepEqual(health.notes, ["payload parse failed"]);
});

test("buildProjectProgressFallback creates owner and sprint detail collections", () => {
  const fallback = buildProjectProgressFallback([
    makeTask({ task_name: "SP57 SDK 안정화", sprint: "SP57", owners: ["Alice"], owner: "Alice" }),
    makeTask({
      id: "task-2",
      task_name: "Sprint 58 라이브 전환",
      sprint: "Sprint 58",
      owners: ["Bob"],
      owner: "Bob",
      is_due_soon: true,
      status: "예정",
      is_active: false,
    }),
  ]);

  const project = fallback[0] as Record<string, unknown>;

  assert.equal(Array.isArray(project.owner_status), true);
  assert.equal(Array.isArray(project.sprint_status), true);
  assert.equal(Array.isArray(project.function_status), true);

  const ownerStatus = project.owner_status as Array<Record<string, unknown>>;
  const sprintStatus = project.sprint_status as Array<Record<string, unknown>>;
  const health = project.project_data_health as Record<string, unknown>;

  assert.equal(ownerStatus[0]?.owner, "Alice");
  assert.equal(sprintStatus[0]?.sprint, "SP57");
  assert.deepEqual(health.notes, [
    "원본 작업 기반 최소 요약을 안전하게 표시합니다.",
  ]);
});
