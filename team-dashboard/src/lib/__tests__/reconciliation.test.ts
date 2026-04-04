import { describe, it, expect } from "vitest";
import {
  matchChannelToProject,
  matchMessageToTask,
  detectConflict,
  reconcile,
} from "@/lib/reconciliation";
import type { WorkItem } from "@/lib/notion";
import type { SlackMessage, SlackData } from "@/lib/slack";

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "test-1",
    title: "로그인 버그 수정",
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

function makeSlackData(msgs: SlackMessage[]): SlackData {
  return {
    messages: msgs,
    users: new Map([["U123", "홍길동"]]),
    lastUpdated: new Date().toISOString(),
  };
}

describe("matchChannelToProject", () => {
  it("matches 'myburgerdiner' to 'My Burger Diner' via normalized substring", () => {
    expect(matchChannelToProject("myburgerdiner", ["My Burger Diner"])).toBe(
      "My Burger Diner",
    );
  });

  it("matches 'projectx' to 'ProjectX' via normalized substring", () => {
    expect(matchChannelToProject("projectx", ["ProjectX"])).toBe("ProjectX");
  });

  it("returns null for 'random-channel' with no matching project", () => {
    expect(
      matchChannelToProject("random-channel", ["My Burger Diner", "ProjectX"]),
    ).toBeNull();
  });

  it("matches '마이버거다이너' via CHANNEL_ALIASES", () => {
    expect(
      matchChannelToProject("마이버거다이너", ["My Burger Diner"]),
    ).toBe("My Burger Diner");
  });
});

describe("matchMessageToTask", () => {
  const users = new Map([["U123", "홍길동"]]);

  it("matches by assignee when userId maps to assignee name", () => {
    const item = makeItem();
    const msg = makeMsg({ text: "일반적인 메시지" });
    expect(matchMessageToTask(msg, [item], users)).toBe(item);
  });

  it("returns null when user is not in the users map", () => {
    const item = makeItem();
    const msg = makeMsg({ userId: "U999" });
    expect(matchMessageToTask(msg, [item], users)).toBeNull();
  });

  it("prefers keyword match within assignee-matched items", () => {
    const item1 = makeItem({ id: "t1", title: "로그인 버그 수정" });
    const item2 = makeItem({ id: "t2", title: "결제 기능 개발" });
    const msg = makeMsg({ text: "로그인 관련 이슈 확인했습니다" });
    const result = matchMessageToTask(msg, [item1, item2], users);
    expect(result).toBe(item1);
  });

  it("returns null for empty items array", () => {
    const msg = makeMsg();
    expect(matchMessageToTask(msg, [], users)).toBeNull();
  });
});

describe("detectConflict", () => {
  it("detects conflict for text with '블로커'", () => {
    const msg = makeMsg({ text: "블로커 발생했습니다" });
    const item = makeItem({ status: "진행중" });
    const result = detectConflict(msg, item);
    expect(result.conflict).toBe(true);
  });

  it("detects conflict for text with 'blocked'", () => {
    const msg = makeMsg({ text: "We are blocked on this" });
    const item = makeItem({ status: "진행중" });
    const result = detectConflict(msg, item);
    expect(result.conflict).toBe(true);
  });

  it("returns no conflict for text with '이슈 없음' (negation)", () => {
    const msg = makeMsg({ text: "블로커 이슈 없음" });
    const item = makeItem({ status: "진행중" });
    const result = detectConflict(msg, item);
    expect(result.conflict).toBe(false);
  });

  it("returns no conflict for text with 'resolved'", () => {
    const msg = makeMsg({ text: "The blocker is resolved now" });
    const item = makeItem({ status: "진행중" });
    const result = detectConflict(msg, item);
    expect(result.conflict).toBe(false);
  });

  it("returns no conflict for text with no blocker keywords", () => {
    const msg = makeMsg({ text: "오늘 작업 잘 진행되고 있어요" });
    const item = makeItem({ status: "진행중" });
    const result = detectConflict(msg, item);
    expect(result.conflict).toBe(false);
  });

  it("returns no conflict for '막혔' when task is done", () => {
    const msg = makeMsg({ text: "어제 막혔었는데" });
    const item = makeItem({ status: "완료" });
    const result = detectConflict(msg, item);
    expect(result.conflict).toBe(false);
  });
});

describe("reconcile", () => {
  it("returns empty results for empty items and empty slack", () => {
    const results = reconcile([], makeSlackData([]));
    expect(results).toEqual([]);
  });

  it("detects conflict from matching Slack blocker message", () => {
    const item = makeItem({ id: "t1", status: "진행중" });
    const msg = makeMsg({
      text: "로그인 블로커 발생",
      channelName: "myburgerdiner",
    });
    const results = reconcile([item], makeSlackData([msg]));
    const found = results.find((r) => r.item.id === "t1");
    expect(found).toBeDefined();
    expect(found!.conflict).toBe(true);
  });

  it("detects overdue conflict for past due date", () => {
    const item = makeItem({
      id: "t2",
      status: "진행중",
      dueDate: "2020-01-01",
    });
    const results = reconcile([item], makeSlackData([]));
    const found = results.find((r) => r.item.id === "t2");
    expect(found).toBeDefined();
    expect(found!.conflict).toBe(true);
    expect(found!.conflictReason).toBe("마감일 초과");
  });
});
