"use client";

import { useState, useMemo } from "react";
import type { TaskItem } from "@/lib/types";
import { StatusBadge, Section } from "./shared";

const RISK_ORDER: Record<string, number> = { blocked: 0, risk: 1, watch: 2, normal: 3 };
const PRIORITY_ORDER: Record<string, number> = {
  "0순위": 0, "1순위": 1, "2순위": 2, "3순위": 3, "4순위": 4, "상시": 5,
};

function uniq(arr: (string | undefined)[]): string[] {
  return Array.from(new Set(arr.filter(Boolean) as string[]));
}

interface Filters {
  project: string;
  owner: string;
  status: string;
  priority: string;
  risk_level: string;
}

export function TasksTable({ tasks }: { tasks: TaskItem[] }) {
  const [filters, setFilters] = useState<Filters>({
    project: "", owner: "", status: "", priority: "", risk_level: "",
  });

  const options = useMemo(() => ({
    projects:   uniq(tasks.map((t) => t.project)),
    owners:     uniq(tasks.map((t) => t.owner)),
    statuses:   uniq(tasks.map((t) => t.status)),
    priorities: uniq(tasks.map((t) => t.priority)),
    riskLevels: uniq(tasks.map((t) => t.risk_level)),
  }), [tasks]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) =>
        (!filters.project   || t.project   === filters.project)   &&
        (!filters.owner     || t.owner     === filters.owner)     &&
        (!filters.status    || t.status    === filters.status)    &&
        (!filters.priority  || t.priority  === filters.priority)  &&
        (!filters.risk_level|| t.risk_level=== filters.risk_level)
      )
      .sort((a, b) => {
        const rd = (RISK_ORDER[a.risk_level ?? ""] ?? 9) - (RISK_ORDER[b.risk_level ?? ""] ?? 9);
        if (rd !== 0) return rd;
        const da = a.deadline ?? "9999";
        const db = b.deadline ?? "9999";
        if (da !== db) return da < db ? -1 : 1;
        const pd = (PRIORITY_ORDER[a.priority ?? ""] ?? 9) - (PRIORITY_ORDER[b.priority ?? ""] ?? 9);
        return pd;
      });
  }, [tasks, filters]);

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  if (!tasks.length) {
    return (
      <Section title="핵심 작업">
        <p className="text-sm text-gray-400 py-4">작업 목록이 없습니다.</p>
      </Section>
    );
  }

  const Select = ({ filterKey, options: opts, label }: { filterKey: keyof Filters; options: string[]; label: string }) => (
    <select
      value={filters[filterKey]}
      onChange={set(filterKey)}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
    >
      <option value="">{label}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <Section title={`핵심 작업 (${filtered.length})`}>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Select filterKey="project"    options={options.projects}   label="전체 프로젝트" />
        <Select filterKey="owner"      options={options.owners}     label="전체 담당자" />
        <Select filterKey="status"     options={options.statuses}   label="전체 상태" />
        <Select filterKey="priority"   options={options.priorities} label="전체 우선순위" />
        <Select filterKey="risk_level" options={options.riskLevels} label="전체 리스크" />
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters({ project: "", owner: "", status: "", priority: "", risk_level: "" })}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg border border-gray-200"
          >
            초기화
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["작업명", "프로젝트", "팀", "담당자", "상태", "우선순위", "Sprint", "마감일", "리스크", "권고 조치", "문서"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((t, i) => (
              <tr key={i} className={`hover:bg-gray-50 ${t.risk_level === "blocked" ? "bg-red-50" : t.risk_level === "risk" ? "bg-orange-50" : ""}`}>
                <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px]">
                  <span className="line-clamp-2">{t.task_name}</span>
                </td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.project ?? "-"}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.team ?? "-"}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.owner ?? "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {t.status ? <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t.status}</span> : "-"}
                </td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.priority ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.sprint ?? "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={t.deadline ? "font-mono text-xs" : "text-gray-400"}>
                    {t.deadline ?? "-"}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {t.risk_level ? <StatusBadge status={t.risk_level} size="xs" /> : "-"}
                </td>
                <td className="px-3 py-2 text-gray-600 max-w-[160px]">
                  <span className="line-clamp-2 text-xs">{t.recommended_action ?? "-"}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {t.doc_url ? (
                    <a
                      href={t.doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline text-xs"
                    >
                      열기 ↗
                    </a>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">필터 조건에 맞는 작업이 없습니다.</div>
        )}
      </div>
    </Section>
  );
}
