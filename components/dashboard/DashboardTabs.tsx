"use client";

import { useState } from "react";
import { TodayTab }            from "./TodayTab";
import { ProjectProgressView } from "./ProjectProgressView";
import { OwnerAlertSummary, TeamOwnerSummary } from "./TeamOwnerSummary";
import { TrendSummary }        from "./TrendSummary";
import { AllTasksTable }       from "./AllTasksTable";
import { SlackSignalsList }    from "./SlackSignalsList";
import { WarningErrorPanel }   from "./WarningErrorPanel";

import type {
  CeoAction,
  ConfirmationQueueItem,
  ProjectProgress,
  OwnerStatus,
  TeamStatus,
  Trend,
  SlackSignal,
  PriorityProject,
} from "@/lib/types";
import type { DashboardTask } from "@/lib/notion-tasks";

// ── 탭 정의 ──────────────────────────────────────────────────────────────────

type TabId = "today" | "projects" | "owners" | "changes" | "raw";

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "today",    label: "오늘",   icon: "⚡" },
  { id: "projects", label: "프로젝트", icon: "📋" },
  { id: "owners",   label: "담당자",  icon: "👤" },
  { id: "changes",  label: "변화",   icon: "📈" },
  { id: "raw",      label: "원본",   icon: "🗂️" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DashboardTabsProps {
  // 오늘 탭
  overviewSummary?: string;
  ceoActions: CeoAction[];
  confirmationQueue: ConfirmationQueueItem[];
  /** overview.priority_projects — 위험 프로젝트 요약에 사용 */
  priorityProjects?: PriorityProject[];

  // 프로젝트 탭
  projectProgress: ProjectProgress[];
  isFallback: boolean;

  // 담당자 탭
  alertOwners: OwnerStatus[];
  teams: TeamStatus[];
  taskOwners: OwnerStatus[];

  // 변화 탭
  trend?: Trend;

  // 원본 탭
  rawTasks: DashboardTask[];
  rawTaskFetchError?: string;
  rawTaskDbConfigured: boolean;
  unlinkedSignals: SlackSignal[];
  errors: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardTabs(props: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("today");

  return (
    <div className="mt-4">
      {/* 탭 바 — 모바일 가로 스크롤 */}
      <div className="overflow-x-auto">
        <div className="flex border-b border-gray-200 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
                "transition-colors focus:outline-none",
                activeTab === tab.id
                  ? "border-b-2 border-indigo-600 text-indigo-600 -mb-px bg-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="pt-4">
        {activeTab === "today" && (
          <TodayTab
            overviewSummary={props.overviewSummary}
            ceoActions={props.ceoActions}
            confirmationQueue={props.confirmationQueue}
            priorityProjects={props.priorityProjects}
            projectProgress={props.projectProgress}
          />
        )}
        {activeTab === "projects" && <ProjectsTab {...props} />}
        {activeTab === "owners"   && <OwnersTab   {...props} />}
        {activeTab === "changes"  && <ChangesTab  {...props} />}
        {activeTab === "raw"      && <RawTab      {...props} />}
      </div>
    </div>
  );
}

// ── 탭별 서브 컴포넌트 ─────────────────────────────────────────────────────────

function ProjectsTab({ projectProgress, isFallback }: DashboardTabsProps) {
  return (
    <div>
      <ProjectProgressView items={projectProgress} isFallback={isFallback} />
    </div>
  );
}

function OwnersTab({ alertOwners, teams, taskOwners }: DashboardTabsProps) {
  return (
    <div className="space-y-4">
      <OwnerAlertSummary owners={alertOwners} />
      <TeamOwnerSummary teams={teams} owners={taskOwners} />
    </div>
  );
}

function ChangesTab({ trend }: DashboardTabsProps) {
  return (
    <div>
      <TrendSummary trend={trend} />
      {!trend && <EmptyTabMessage message="이전 실행 데이터가 없어 변화를 비교할 수 없습니다." />}
    </div>
  );
}

function RawTab({
  rawTasks,
  rawTaskFetchError,
  rawTaskDbConfigured,
  unlinkedSignals,
  errors,
}: DashboardTabsProps) {
  return (
    <div className="space-y-4">
      <AllTasksTable
        tasks={rawTasks}
        fetchError={rawTaskFetchError}
        rawTaskDbConfigured={rawTaskDbConfigured}
      />
      {unlinkedSignals.length > 0 && (
        <SlackSignalsList signals={unlinkedSignals} title="미연결 Slack 신호" />
      )}
      <WarningErrorPanel errors={errors} />
    </div>
  );
}

// ── 빈 탭 안내 ───────────────────────────────────────────────────────────────

function EmptyTabMessage({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-3xl mb-2">📭</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}
