"use client";

import type { AttentionItemV2 } from "@/lib/types";
import { UrgencyBadge } from "./shared";

type AnyRecord = Record<string, unknown>;

function extractText(it: AttentionItemV2): string {
  const r = it as unknown as AnyRecord;
  return String(
    it.item || r.title || r.task_name || r.summary || r.request || ""
  ).trim();
}

function extractDescription(it: AttentionItemV2): string {
  const r = it as unknown as AnyRecord;
  return String(
    it.why || r.description || r.reason || r.requested_action || r.next_action || ""
  ).trim();
}

function extractAction(it: AttentionItemV2): string {
  const r = it as unknown as AnyRecord;
  return String(
    it.recommended_action || r.next_action || r.requested_action || ""
  ).trim();
}

function extractProject(it: AttentionItemV2): string {
  const r = it as unknown as AnyRecord;
  return String(it.project || r.project_name || r.target || "").trim();
}

function extractOwner(it: AttentionItemV2): string {
  const r = it as unknown as AnyRecord;
  const owners = r.owners as string[] | undefined;
  return String(it.owner || (owners?.[0]) || "").trim();
}

export function AttentionList({ items }: { items: AttentionItemV2[] }) {
  const visible = items.filter((it) => extractText(it).length > 0);

  if (!visible.length) return null;

  return (
    <div className="mt-4 space-y-3">
      {visible.map((it, i) => {
        const mainText   = extractText(it);
        const desc       = extractDescription(it);
        const action     = extractAction(it);
        const project    = extractProject(it);
        const owner      = extractOwner(it);

        return (
          <div
            key={i}
            className={`rounded-xl border px-5 py-4 bg-white shadow-sm ${
              it.urgency === "critical"
                ? "border-red-300 bg-red-50"
                : it.urgency === "high"
                ? "border-orange-200"
                : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                  {it.rank ?? i + 1}
                </span>
                <p className="font-semibold text-gray-900 text-sm leading-snug">{mainText}</p>
              </div>
              <UrgencyBadge urgency={it.urgency} />
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              {project && <span className="bg-gray-100 px-2 py-0.5 rounded-full">📁 {project}</span>}
              {it.team  && <span className="bg-gray-100 px-2 py-0.5 rounded-full">👥 {it.team}</span>}
              {owner    && <span className="bg-gray-100 px-2 py-0.5 rounded-full">👤 {owner}</span>}
            </div>

            {desc && (
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{desc}</p>
            )}

            {it.evidence && (
              <p className="mt-1 text-xs text-gray-400 italic">{it.evidence}</p>
            )}

            {action && (
              <div className="mt-2 flex items-start gap-1.5">
                <span className="text-xs font-semibold text-indigo-600 shrink-0 mt-0.5">→</span>
                <p className="text-xs text-indigo-700 font-medium">{action}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
