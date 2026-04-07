import type { WorkItem } from "./notion";
import type { SlackMessage } from "./slack";
import { isDone, isInProgress, isPaused, isReviewPending, isHighPriority, daysBetween } from "./status";

export interface Alert {
  severity: number;
  rule: string;
  item: WorkItem;
  reason: string;
  daysElapsed: number;
  slackDemoted: boolean;
}

const CHANNEL_ALIASES: Record<string, string> = {
  "마이버거다이너": "My Burger Diner",
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, "");
}

function hasRecentSlackActivity(
  project: string,
  slackMessages: SlackMessage[],
  days: number = 7
): boolean {
  const normProject = normalize(project);
  const cutoff = Date.now() / 1000 - days * 24 * 60 * 60;

  return slackMessages.some((msg) => {
    if (Number(msg.ts) < cutoff) return false;
    const normCh = normalize(msg.channelName);

    // alias check
    const aliasMatch = Object.entries(CHANNEL_ALIASES).find(([alias]) =>
      normCh.includes(normalize(alias))
    );
    if (aliasMatch && aliasMatch[1] === project) return true;

    return normProject.includes(normCh) || normCh.includes(normProject);
  });
}

export function detectBottlenecks(
  items: WorkItem[],
  slackMessages: SlackMessage[] = []
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  for (const item of items) {
    if (isDone(item.status)) continue;
    // 일시 정지 항목은 overdue/deadline_imminent 에서 제외 (의도적 보류)
    // long_paused 규칙에서만 감지
    if (isPaused(item.status)) {
      const pauseEditDays = item.lastEdited ? daysBetween(item.lastEdited, now) : 0;
      if (pauseEditDays >= 7) {
        alerts.push({
          severity: 30,
          rule: "long_paused",
          item,
          reason: `일시 정지 ${pauseEditDays}일째`,
          daysElapsed: pauseEditDays,
          slackDemoted: false,
        });
      }
      continue;
    }

    const editDays = item.lastEdited ? daysBetween(item.lastEdited, now) : 0;

    // 1. 마감 초과 (진행 중인 항목만 high severity)
    if (item.dueDate && new Date(item.dueDate) < now) {
      const overdueDays = daysBetween(item.dueDate, now);
      const active = isInProgress(item.status);
      alerts.push({
        severity: active ? Math.min(90 + overdueDays, 100) : 55,
        rule: "overdue",
        item,
        reason: `마감일 ${overdueDays}일 초과${!active ? ` (${item.status})` : ""}`,
        daysElapsed: overdueDays,
        slackDemoted: false,
      });
      continue; // 마감 초과는 다른 규칙과 중복 불필요
    }

    // 2. 마감 임박 (D-3)
    if (item.dueDate) {
      const diff = new Date(item.dueDate).getTime() - now.getTime();
      const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 3) {
        alerts.push({
          severity: 80,
          rule: "deadline_imminent",
          item,
          reason: `마감 D-${daysLeft}`,
          daysElapsed: daysLeft,
          slackDemoted: false,
        });
        continue;
      }
    }

    // 3. 장기 체류 (진행 중 + 14일 미편집)
    if (isInProgress(item.status) && editDays >= 14) {
      const slackActive = hasRecentSlackActivity(item.project, slackMessages);
      alerts.push({
        severity: slackActive ? 40 : 70,
        rule: "stale",
        item,
        reason: `${editDays}일간 업데이트 없음${slackActive ? " (슬랙 활동 있음)" : ""}`,
        daysElapsed: editDays,
        slackDemoted: slackActive,
      });
    }

    // 4. 확인 방치 (확인 요청 + 3일 미편집)
    if (isReviewPending(item.status) && editDays >= 3) {
      alerts.push({
        severity: 65,
        rule: "review_ignored",
        item,
        reason: `확인 요청 후 ${editDays}일 방치`,
        daysElapsed: editDays,
        slackDemoted: false,
      });
    }

    // 5. 0순위 미마감
    if (isHighPriority(item.priority) && !item.dueDate) {
      alerts.push({
        severity: 60,
        rule: "p0_no_deadline",
        item,
        reason: `${item.priority} 작업에 마감일 없음`,
        daysElapsed: 0,
        slackDemoted: false,
      });
    }


  }

  alerts.sort((a, b) => b.severity - a.severity);
  return alerts;
}
