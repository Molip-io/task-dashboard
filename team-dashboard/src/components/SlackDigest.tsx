"use client";

import type { SlackMessage, SlackCategory } from "@/lib/slack";

export const CATEGORY_CONFIG: Record<SlackCategory, { label: string; icon: string; color: string; dotColor: string }> = {
  schedule: { label: "예정된 일정", icon: "📅", color: "text-purple-700", dotColor: "bg-purple-400" },
  action:   { label: "필요한 액션", icon: "⚡", color: "text-amber-700", dotColor: "bg-amber-400" },
  issue:    { label: "이슈 / 리스크", icon: "🚨", color: "text-red-700", dotColor: "bg-red-400" },
  update:   { label: "진행 현황", icon: "📋", color: "text-blue-700", dotColor: "bg-blue-400" },
};

export const CATEGORY_ORDER: SlackCategory[] = ["issue", "schedule", "action", "update"];

export function dedup(msgs: SlackMessage[]): SlackMessage[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    const key = m.summary.slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function SlackDigest({ msgs }: { msgs: SlackMessage[] }) {
  if (msgs.length === 0) return null;

  const byCategory = new Map<SlackCategory, SlackMessage[]>();
  for (const msg of msgs) {
    if (!byCategory.has(msg.category)) byCategory.set(msg.category, []);
    byCategory.get(msg.category)!.push(msg);
  }

  const sections = CATEGORY_ORDER.filter((cat) => byCategory.has(cat));
  if (sections.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
      <p className="text-xs font-medium text-gray-500">💬 슬랙 논의 요약 ({msgs.length}건)</p>
      {sections.map((cat) => {
        const config = CATEGORY_CONFIG[cat];
        const items = dedup(byCategory.get(cat)!);
        const shown = cat === "update" ? items.slice(0, 5) : items;
        const hidden = cat === "update" ? items.length - 5 : 0;

        return (
          <div key={cat}>
            <p className={`text-xs font-semibold ${config.color} mb-1`}>
              {config.icon} {config.label}
            </p>
            <ul className="space-y-0.5">
              {shown.map((msg) => (
                <li key={msg.ts} className="text-sm flex items-start gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor} shrink-0 mt-1.5`} />
                  <span className="text-gray-700">{msg.summary}</span>
                </li>
              ))}
              {hidden > 0 && (
                <li className="text-xs text-gray-400 pl-4">... 외 {hidden}건</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
