import { describe, it, expect } from "vitest";
import { isDone, isInProgress, isOverdue, isUrgent } from "@/lib/status";
import type { WorkItem } from "@/lib/notion";

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "test-1",
    title: "Test",
    status: "진행중",
    assignee: "홍길동",
    team: "개발팀",
    project: "테스트",
    dueDate: null,
    priority: "보통",
    sprint: "",
    lastEdited: new Date().toISOString(),
    url: "https://notion.so/test",
    ...overrides,
  };
}

describe("isDone", () => {
  it("returns true for '완료'", () => {
    expect(isDone("완료")).toBe(true);
  });

  it("returns true for 'done'", () => {
    expect(isDone("done")).toBe(true);
  });

  it("returns true for 'Done' (case-insensitive)", () => {
    expect(isDone("Done")).toBe(true);
  });

  it("returns true for 'complete'", () => {
    expect(isDone("complete")).toBe(true);
  });

  it("returns false for '진행중'", () => {
    expect(isDone("진행중")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDone("")).toBe(false);
  });
});

describe("isInProgress", () => {
  it("returns true for '진행중'", () => {
    expect(isInProgress("진행중")).toBe(true);
  });

  it("returns true for '진행 중'", () => {
    expect(isInProgress("진행 중")).toBe(true);
  });

  it("returns true for 'In Progress' (case-insensitive)", () => {
    expect(isInProgress("In Progress")).toBe(true);
  });

  it("returns true for 'doing'", () => {
    expect(isInProgress("doing")).toBe(true);
  });

  it("returns false for '완료'", () => {
    expect(isInProgress("완료")).toBe(false);
  });
});

describe("isOverdue", () => {
  it("returns false for null", () => {
    expect(isOverdue(null)).toBe(false);
  });

  it("returns true for past date", () => {
    expect(isOverdue("2020-01-01")).toBe(true);
  });

  it("returns false for future date", () => {
    expect(isOverdue("2099-12-31")).toBe(false);
  });
});

describe("isUrgent", () => {
  it("returns true for priority '긴급'", () => {
    expect(isUrgent(makeItem({ priority: "긴급" }))).toBe(true);
  });

  it("returns false for priority '보통' with due date > 3 days away", () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    expect(isUrgent(makeItem({ priority: "보통", dueDate: futureDate }))).toBe(false);
  });

  it("returns true for priority '보통' with due date within 3 days", () => {
    const soonDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    expect(isUrgent(makeItem({ priority: "보통", dueDate: soonDate }))).toBe(true);
  });
});
