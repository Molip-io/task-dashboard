import type { WorkItem } from "@/lib/notion";
import type { SlackCategory, SlackMessage, SlackData } from "@/lib/slack";
import { isDone, isInProgress, isOverdue, isPaused } from "@/lib/status";

export interface SlackSignal {
  summary: string;
  category: SlackCategory;
  ts: string;
  channelName: string;
}

export interface ReconciliationResult {
  item: WorkItem;
  conflict: boolean;
  conflictReason?: string;
  slackSignals: SlackSignal[];
  confidence: "high" | "medium" | "low";
}

const CHANNEL_ALIASES: Record<string, string> = {
  "마이버거다이너": "My Burger Diner",
};

const BLOCKER_KR = ["블로커", "막혔", "막힘", "지연", "진행이 안", "불가", "대기중"];
const BLOCKER_EN = ["blocked", "blocker", "delayed", "stuck", "waiting"];
const NEGATION = ["이슈 없음", "해결됨", "no blocker", "resolved", "문제 없음", "해결 완료"];
const RESOLUTION_KW = ["해결", "resolved", "fixed", "해결됨", "완료"];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, "");
}

export function matchChannelToProject(channelName: string, projectNames: string[]): string | null {
  if (CHANNEL_ALIASES[channelName]) {
    const alias = CHANNEL_ALIASES[channelName];
    if (projectNames.includes(alias)) return alias;
  }
  const normChannel = normalize(channelName);
  for (const project of projectNames) {
    const normProject = normalize(project);
    if (normChannel.includes(normProject) || normProject.includes(normChannel)) {
      return project;
    }
  }
  return null;
}

export function matchMessageToTask(
  msg: SlackMessage,
  items: WorkItem[],
  users: Map<string, string>,
): WorkItem | null {
  const displayName = users.get(msg.userId);
  if (!displayName) return null;

  const nameLower = displayName.toLowerCase();
  const assigneeMatched = items.filter(
    (item) => item.assignee.toLowerCase().includes(nameLower),
  );
  if (assigneeMatched.length === 0) return null;

  const textLower = msg.text.toLowerCase();
  const keywordMatched = assigneeMatched.filter((item) => {
    const keywords = item.title.split(/\s+/).filter((w) => w.length >= 3);
    return keywords.some((kw) => textLower.includes(kw.toLowerCase()));
  });

  return keywordMatched.length > 0 ? keywordMatched[0] : assigneeMatched[0];
}

export function detectConflict(
  msg: SlackMessage,
  item: WorkItem,
): { conflict: boolean; reason?: string } {
  const textLower = msg.text.toLowerCase();

  if (NEGATION.some((n) => textLower.includes(n.toLowerCase()))) {
    return { conflict: false };
  }

  const allBlockers = [...BLOCKER_KR, ...BLOCKER_EN];
  const matched = allBlockers.find((kw) => textLower.includes(kw.toLowerCase()));

  if (matched && !isDone(item.status)) {
    const reason = isInProgress(item.status)
      ? `슬랙에서 블로커 신호 감지 (진행중 상태와 충돌): ${matched}`
      : `슬랙에서 블로커 신호 감지: ${matched}`;
    return { conflict: true, reason };
  }

  return { conflict: false };
}

export function reconcile(items: WorkItem[], slack: SlackData): ReconciliationResult[] {
  const projectNames = [...new Set(items.map((i) => i.project))];

  // Group messages by channel
  const byChannel = new Map<string, SlackMessage[]>();
  for (const msg of slack.messages) {
    const arr = byChannel.get(msg.channelName) || [];
    arr.push(msg);
    byChannel.set(msg.channelName, arr);
  }

  // Per-task state
  const taskConflicts = new Map<string, {
    reason: string;
    confidence: "high" | "medium" | "low";
    ts: string;
  }>();
  const taskSignals = new Map<string, SlackSignal[]>();

  for (const [channelName, msgs] of byChannel) {
    const project = matchChannelToProject(channelName, projectNames);
    if (!project) continue;

    // Sort messages by timestamp ascending for resolution scanning
    const sorted = [...msgs].sort((a, b) => Number(a.ts) - Number(b.ts));

    // Track blocker tasks to check for resolution
    const blockerTasks = new Map<string, number>(); // taskId -> index of blocker msg

    for (let i = 0; i < sorted.length; i++) {
      const msg = sorted[i];
      const projectItems = items.filter((it) => it.project === project);
      const matched = matchMessageToTask(msg, projectItems, slack.users);

      if (matched) {
        const signals = taskSignals.get(matched.id) || [];
        signals.push({
          summary: msg.summary,
          category: msg.category,
          ts: msg.ts,
          channelName: msg.channelName,
        });
        taskSignals.set(matched.id, signals);

        const result = detectConflict(msg, matched);
        if (result.conflict && result.reason) {
          const existing = taskConflicts.get(matched.id);
          if (!existing || Number(msg.ts) > Number(existing.ts)) {
            taskConflicts.set(matched.id, {
              reason: result.reason,
              confidence: "high",
              ts: msg.ts,
            });
          }
          blockerTasks.set(matched.id, i);
        }
      } else {
        // Channel-level: apply to all project items without specific match
        for (const projItem of projectItems) {
          const result = detectConflict(msg, projItem);
          if (result.conflict && result.reason) {
            const existing = taskConflicts.get(projItem.id);
            if (!existing || existing.confidence !== "high") {
              taskConflicts.set(projItem.id, {
                reason: result.reason,
                confidence: "medium",
                ts: msg.ts,
              });
              blockerTasks.set(projItem.id, i);
            }
          }
        }
      }
    }

    // Resolution check: scan for resolution keywords after blocker messages
    for (const [taskId, blockerIdx] of blockerTasks) {
      for (let j = blockerIdx + 1; j < sorted.length; j++) {
        const laterText = sorted[j].text.toLowerCase();
        if (RESOLUTION_KW.some((kw) => laterText.includes(kw))) {
          taskConflicts.delete(taskId);
          break;
        }
      }
    }
  }

  // Build results
  const results: ReconciliationResult[] = items.map((item) => {
    const conflict = taskConflicts.get(item.id);
    const signals = taskSignals.get(item.id) || [];

    // Overdue check — 일시 정지 항목은 의도적 보류이므로 제외
    if (!conflict && isOverdue(item.dueDate) && !isDone(item.status) && !isPaused(item.status)) {
      const active = isInProgress(item.status);
      return {
        item,
        conflict: true,
        conflictReason: active ? "마감일 초과" : `마감일 초과 (${item.status})`,
        slackSignals: signals,
        confidence: active ? "high" as const : "medium" as const,
      };
    }

    return {
      item,
      conflict: !!conflict,
      conflictReason: conflict?.reason,
      slackSignals: signals,
      confidence: conflict?.confidence ?? "low",
    };
  });

  // Sort: conflicts first, then by confidence
  const confOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => {
    if (a.conflict !== b.conflict) return a.conflict ? -1 : 1;
    return confOrder[a.confidence] - confOrder[b.confidence];
  });

  return results;
}
