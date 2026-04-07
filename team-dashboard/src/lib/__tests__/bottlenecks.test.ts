import { describe, it, expect } from "vitest";
import { detectBottlenecks } from "@/lib/bottlenecks";
import type { WorkItem } from "@/lib/notion";
import type { SlackMessage } from "@/lib/slack";

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "test-1",
    title: "테스트 작업",
    status: "진행중",
    assignee: "홍길동",
    team: "개발팀",
    project: "My Burger Diner",
    dueDate: null,
    priority: "보통",
    sprint: "",
    lastEdited: new Date().toISOString(),
    url: "https://notion.so/test",
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  // Use date-only string to avoid sub-day rounding issues
  return d.toISOString().split("T")[0];
}

function makeMsg(overrides: Partial<SlackMessage> = {}): SlackMessage {
  return {
    ts: String(Date.now() / 1000),
    text: "테스트 메시지",
    summary: "테스트",
    userId: "U123",
    channel: "C001",
    channelName: "myburgerdiner",
    category: "update" as const,
    ...overrides,
  };
}

describe("detectBottlenecks", () => {
  it("overdue — item with past dueDate returns severity 90+", () => {
    const item = makeItem({ dueDate: daysAgo(1) });
    const alerts = detectBottlenecks([item]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule).toBe("overdue");
    expect(alerts[0].severity).toBeGreaterThanOrEqual(90);
  });

  it("deadline_imminent — item with dueDate in 2 days returns severity 80", () => {
    const item = makeItem({ dueDate: daysFromNow(2) });
    const alerts = detectBottlenecks([item]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule).toBe("deadline_imminent");
    expect(alerts[0].severity).toBe(80);
  });

  it("stale — in-progress item with lastEdited 20 days ago returns severity 70", () => {
    const item = makeItem({ status: "진행중", lastEdited: daysAgo(20) });
    const alerts = detectBottlenecks([item]);
    const stale = alerts.find((a) => a.rule === "stale");
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe(70);
    expect(stale!.slackDemoted).toBe(false);
  });

  it("stale + slack activity — severity demoted to 40 when matching slack messages exist", () => {
    const item = makeItem({
      status: "진행중",
      project: "My Burger Diner",
      lastEdited: daysAgo(20),
    });
    const msg = makeMsg({ channelName: "myburgerdiner", ts: String(Date.now() / 1000) });
    const alerts = detectBottlenecks([item], [msg]);
    const stale = alerts.find((a) => a.rule === "stale");
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe(40);
    expect(stale!.slackDemoted).toBe(true);
  });

  it("review_ignored — status '확인 요청' with lastEdited 5 days ago returns severity 65", () => {
    const item = makeItem({ status: "확인 요청", lastEdited: daysAgo(5) });
    const alerts = detectBottlenecks([item]);
    const alert = alerts.find((a) => a.rule === "review_ignored");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe(65);
  });

  it("p0_no_deadline — priority '0순위' with no dueDate returns severity 60", () => {
    const item = makeItem({ priority: "0순위", dueDate: null });
    const alerts = detectBottlenecks([item]);
    const alert = alerts.find((a) => a.rule === "p0_no_deadline");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe(60);
  });

  it("long_paused — status '일시정지' with lastEdited 10 days ago returns severity 30", () => {
    const item = makeItem({ status: "일시정지", lastEdited: daysAgo(10) });
    const alerts = detectBottlenecks([item]);
    const alert = alerts.find((a) => a.rule === "long_paused");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe(30);
  });

  it("done items skipped — completed items do not generate alerts", () => {
    const item = makeItem({ status: "완료", dueDate: daysAgo(5) });
    const alerts = detectBottlenecks([item]);
    expect(alerts).toHaveLength(0);
  });

  it("empty input — returns empty alerts array", () => {
    const alerts = detectBottlenecks([]);
    expect(alerts).toEqual([]);
  });

  it("sorted by severity — multiple alerts returned in descending severity order", () => {
    const overdueItem = makeItem({ id: "a", dueDate: daysAgo(1) });
    const staleItem = makeItem({ id: "b", status: "진행중", lastEdited: daysAgo(20) });
    const pausedItem = makeItem({ id: "c", status: "일시정지", lastEdited: daysAgo(10) });
    const alerts = detectBottlenecks([staleItem, pausedItem, overdueItem]);
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i - 1].severity).toBeGreaterThanOrEqual(alerts[i].severity);
    }
    expect(alerts[0].rule).toBe("overdue");
  });
});
