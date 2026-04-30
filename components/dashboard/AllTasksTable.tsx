"use client";

import { useState, useMemo } from "react";
import type { DashboardTask } from "@/lib/notion-tasks";
import { StatusBadge, Section } from "./shared";

const RISK_COLORS: Record<string, string> = {
  blocked: "bg-red-50",
  risk:    "bg-orange-50",
};

interface Filters {
  project:  string;
  owner:    string;
  team:     string;
  status:   string;
  priority: string;
}

function uniq(vals: (string | undefined)[]): string[] {
  return Array.from(new Set(vals.filter(Boolean) as string[])).sort();
}

function DeadlineCell({ task }: { task: DashboardTask }) {
  if (!task.deadline) return <span className="text-xs text-gray-400">-</span>;
  const cls = task.is_overdue
    ? "font-mono text-xs text-red-600 font-semibold"
    : task.is_due_soon
    ? "font-mono text-xs text-orange-600 font-semibold"
    : "font-mono text-xs text-gray-700";
  return <span className={cls}>{task.deadline}{task.is_overdue ? " ⚠" : task.is_due_soon ? " ⏰" : ""}</span>;
}

function OwnerPills({ owners }: { owners: string[] }) {
  if (!owners.length) return <span className="text-xs text-gray-400">미기록</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {owners.map((o) => (
        <span key={o} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {o}
        </span>
      ))}
    </div>
  );
}

export function AllTasksTable({ tasks }: { tasks: DashboardTask[] }) {
  const [filters, setFilters] = useState<Filters>({
    project: "", owner: "", team: "", status: "", priority: "",
  });
  const [showDone, setShowDone] = useState(false);

  const options = useMemo(() => {
    const allOwners = tasks.flatMap((t) => t.owners.length ? t.owners : [t.owner]);
    return {
      projects:   uniq(tasks.map((t) => t.project)),
      owners:     uniq(allOwners),
      teams:      uniq(tasks.map((t) => t.team)),
      statuses:   uniq(tasks.map((t) => t.status)),
      priorities: uniq(tasks.map((t) => t.priority)),
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (!showDone && t.is_done) return false;
        const ownerList = t.owners.length ? t.owners : [t.owner];
        return (
          (!filters.project  || t.project  === filters.project) &&
          (!filters.owner    || ownerList.includes(filters.owner)) &&
          (!filters.team     || t.team     === filters.team) &&
          (!filters.status   || t.status   === filters.status) &&
          (!filters.priority || t.priority === filters.priority)
        );
      })
      .sort((a, b) => {
        // overdue first, then due_soon, then active, then rest
        const score = (t: DashboardTask) =>
          t.is_overdue ? 0 : t.is_due_soon ? 1 : t.is_active ? 2 : t.is_done ? 4 : 3;
        const sd = score(a) - score(b);
        if (sd !== 0) return sd;
        const da = a.deadline ?? "9999";
        const db = b.deadline ?? "9999";
        return da < db ? -1 : da > db ? 1 : 0;
      });
  }, [tasks, filters, showDone]);

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  const clearFilters = () => setFilters({ project: "", owner: "", team: "", status: "", priority: "" });
  const hasFilter = Object.values(filters).some(Boolean);

  // counts for tab display
  const doneCount   = tasks.filter((t) => t.is_done).length;
  const activeCount = filtered.filter((t) => t.is_active).length;
  const overdueCount = filtered.filter((t) => t.is_overdue).length;

  if (!tasks.length) {
    return (
      <Section title="전체 작업">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-8 text-center">
          <p className="text-sm text-gray-500">수집된 작업이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">
            NOTION_TASK_DATABASE_ID 환경변수를 설정하면 전체 작업이 여기에 표시됩니다.
          </p>
        </div>
      </Section>
    );
  }

  const Select = ({ filterKey, options: opts, label }: {
    filterKey: keyof Filters; options: string[]; label: string;
  }) => (
    <select
      value={filters[filterKey]}
      onChange={set(filterKey)}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
    >
      <option value="">{label}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const sectionTitle = overdueCount > 0
    ? `전체 작업 (${filtered.length}) — 마감 초과 ${overdueCount}건 ⚠`
    : `전체 작업 (${filtered.length})`;

  return (
    <Section title={sectionTitle}>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select filterKey="project"  options={options.projects}   label="전체 프로젝트" />
        <Select filterKey="owner"    options={options.owners}     label="전체 담당자" />
        <Select filterKey="team"     options={options.teams}      label="전체 팀" />
        <Select filterKey="status"   options={options.statuses}   label="전체 상태" />
        <Select filterKey="priority" options={options.priorities} label="전체 우선순위" />

        {/* 완료 포함 토글 */}
        <label className="flex items-center gap-1.5 cursor-pointer ml-1 text-xs text-gray-600 select-none">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-400"
          />
          완료 포함 ({doneCount}건)
        </label>

        {hasFilter && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            초기화
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          진행 중 <strong className="text-gray-600">{activeCount}</strong>건
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["작업명", "프로젝트", "팀", "담당자", "상태", "우선순위", "Sprint", "마감일", "문서"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((t) => {
              const rowBg = RISK_COLORS[t.is_overdue ? "blocked" : t.is_due_soon ? "risk" : ""] ?? "";
              const owners = t.owners.length ? t.owners : [];
              return (
                <tr key={t.id} className={`hover:bg-gray-50 ${rowBg}`}>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className={`line-clamp-2 text-sm ${t.is_done ? "line-through text-gray-400" : "font-medium text-gray-900"}`}>
                      {t.task_name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">{t.project}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">{t.team !== "미분류" ? t.team : <span className="text-gray-400">미분류</span>}</td>
                  <td className="px-3 py-2 min-w-[100px]"><OwnerPills owners={owners} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t.status !== "미기록"
                      ? <StatusBadge status={t.status} size="xs" />
                      : <span className="text-xs text-gray-400">미기록</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                    {t.priority !== "미기록" ? t.priority : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {t.sprint || <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap"><DeadlineCell task={t} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t.document_link
                      ? <a href={t.document_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-xs">열기 ↗</a>
                      : <span className="text-gray-400 text-xs">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">필터 조건에 맞는 작업이 없습니다.</div>
        )}
      </div>
    </Section>
  );
}
