"use client";

import { useState } from "react";
import { TodayTab }            from "./TodayTab";
import { ProjectProgressView } from "./ProjectProgressView";
import { OwnersTab }           from "./OwnersTab";
import { ChangesTab }          from "./ChangesTab";
import { RawDataTab }          from "./RawDataTab";

import type {
  CeoAction,
  ConfirmationQueueItem,
  ProjectProgress,
  OwnerStatus,
  TeamStatus,
  Trend,
  SlackSignal,
  PriorityProject,
  SourceMetaV2,
} from "@/lib/types";
import type { DashboardTask } from "@/lib/notion-tasks";
import type { NotionPayloadDebug } from "@/lib/notion-summary";
import type { ProjectFallbackMode } from "@/lib/project-progress-view-model";

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
  projectFallbackMode?: ProjectFallbackMode;
  parseErrorRunId?: string;
  parseErrorMessage?: string;

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
  allSignals?: SlackSignal[];
  errors: string[];
  warnings?: string[];
  sourceMeta?: SourceMetaV2;
  payloadDebug?: NotionPayloadDebug;
  // 수집 상태 요약용
  runId?: string;
  source?: string;
  runStatus?: string;
  agentTaskCount?: number;
  slackSignalCount?: number;
  generatedBy?: string;
  createdAt?: string;
  normalizedProjectCount?: number;
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
        {activeTab === "owners"   && <OwnersTabPanel {...props} />}
        {activeTab === "changes"  && <ChangesTabPanel {...props} />}
        {activeTab === "raw"      && <RawTab      {...props} />}
      </div>
    </div>
  );
}

// ── 탭별 서브 컴포넌트 ─────────────────────────────────────────────────────────

function ProjectsTab({
  projectProgress,
  isFallback,
  projectFallbackMode,
  parseErrorRunId,
  parseErrorMessage,
  rawTasks,
}: DashboardTabsProps) {
  return (
    <div>
      <ProjectProgressView
        items={projectProgress}
        isFallback={isFallback}
        fallbackMode={projectFallbackMode}
        parseErrorRunId={parseErrorRunId}
        parseErrorMessage={parseErrorMessage}
        rawTasks={rawTasks}
      />
    </div>
  );
}

function OwnersTabPanel({ taskOwners, confirmationQueue, rawTasks }: DashboardTabsProps) {
  return (
    <OwnersTab
      taskOwners={taskOwners}
      confirmationQueue={confirmationQueue}
      rawTasks={rawTasks}
    />
  );
}

function ChangesTabPanel({ trend }: DashboardTabsProps) {
  return <ChangesTab trend={trend} />;
}

function RawTab(props: DashboardTabsProps) {
  return (
      <RawDataTab
      runId={props.runId}
      source={props.source}
      runStatus={props.runStatus}
      rawTaskCount={props.rawTasks.length}
      rawTaskDbConfigured={props.rawTaskDbConfigured}
      agentTaskCount={props.agentTaskCount}
      slackSignalCount={props.slackSignalCount}
      generatedBy={props.generatedBy}
      createdAt={props.createdAt}
      rawTasks={props.rawTasks}
      rawTaskFetchError={props.rawTaskFetchError}
      unlinkedSignals={props.unlinkedSignals}
      allSignals={props.allSignals}
      warnings={props.warnings}
      errors={props.errors}
      sourceMeta={props.sourceMeta}
      payloadDebug={props.payloadDebug}
      projectFallbackMode={props.projectFallbackMode}
      parseErrorRunId={props.parseErrorRunId}
      parseErrorMessage={props.parseErrorMessage}
      normalizedProjectCount={props.normalizedProjectCount}
    />
  );
}
