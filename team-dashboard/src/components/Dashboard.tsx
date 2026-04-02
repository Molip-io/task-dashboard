"use client";

import { useState, useEffect, useMemo } from "react";
import type { DashboardData, WorkItem } from "@/lib/notion";
import type { SlackData } from "@/lib/slack";
import SummaryCards from "./SummaryCards";
import WorkTable from "./WorkTable";
import ProjectView from "./ProjectView";
import WeeklyReport from "./WeeklyReport";

type TabKey = "all" | "team" | "project" | "assignee" | "weekly";

interface TabOption {
  key: TabKey;
  label: string;
}

const tabs: TabOption[] = [
  { key: "all", label: "전체" },
  { key: "team", label: "팀별" },
  { key: "project", label: "프로젝트별" },
  { key: "assignee", label: "담당자별" },
  { key: "weekly", label: "주간 보고" },
];

export default function Dashboard() {
  const [data, setData] = useState<(DashboardData & { slack?: SlackData }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [selectedFilter, setSelectedFilter] = useState<string>("전체");
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("데이터 로딩 실패");
        return res.json();
      })
      .then((d: DashboardData & { slack?: SlackData }) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const filterOptions = useMemo(() => {
    if (!data) return [];
    switch (activeTab) {
      case "team":
        return data.teams;
      case "project":
        return data.projects;
      case "assignee":
        return data.assignees;
      default:
        return [];
    }
  }, [data, activeTab]);

  const filteredItems = useMemo((): WorkItem[] => {
    if (!data) return [];
    if (activeTab === "all" || selectedFilter === "전체") return data.items;
    return data.items.filter((item) => {
      switch (activeTab) {
        case "team":
          return item.team === selectedFilter;
        case "project":
          return item.project === selectedFilter;
        case "assignee":
          return item.assignee === selectedFilter;
        default:
          return true;
      }
    });
  }, [data, activeTab, selectedFilter]);

  // 탭 변경시 필터 리셋
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSelectedFilter("전체");
  };

  // 글로벌 검색: 프로젝트명 매칭 시 프로젝트 탭으로 자동 이동
  const handleGlobalSearch = (query: string) => {
    setGlobalSearch(query);
    if (!data || !query) return;

    const q = query.toLowerCase();
    const matchedProject = data.projects.find((p) => p.toLowerCase().includes(q));
    if (matchedProject) {
      setActiveTab("project");
      setSelectedFilter(matchedProject);
      return;
    }
    const matchedTeam = data.teams.find((t) => t.toLowerCase().includes(q));
    if (matchedTeam) {
      setActiveTab("team");
      setSelectedFilter(matchedTeam);
      return;
    }
    // 일반 검색은 전체 탭의 테이블 검색에 위임
    setActiveTab("all");
    setSelectedFilter("전체");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Notion에서 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 font-medium mb-2">오류 발생</p>
        <p className="text-red-600 text-sm">{error}</p>
        <p className="text-gray-500 text-xs mt-3">
          .env.local 파일에 NOTION_TOKEN과 NOTION_DATABASE_IDS를 확인하세요
        </p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <p className="text-yellow-700 font-medium mb-2">데이터 없음</p>
        <p className="text-yellow-600 text-sm">
          Notion 데이터베이스에 항목이 없거나, .env.local 설정을 확인하세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 글로벌 검색 */}
      <div className="relative">
        <input
          type="text"
          placeholder="프로젝트, 팀, 담당자 검색... (예: 피자레디)"
          value={globalSearch}
          onChange={(e) => handleGlobalSearch(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
        />
        {globalSearch && (
          <button
            onClick={() => { setGlobalSearch(""); setActiveTab("all"); setSelectedFilter("전체"); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {/* 요약 카드 (주간보고 탭에서는 숨김) */}
      {activeTab !== "weekly" && <SummaryCards items={filteredItems} />}

      {/* 탭 네비게이션 */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}

        {/* 필터 드롭다운 (주간보고/프로젝트카드뷰에서는 숨김) */}
        {filterOptions.length > 0 && activeTab !== "weekly" && !(activeTab === "project" && selectedFilter === "전체") && (
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
            className="ml-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="전체">전체</option>
            {filterOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 탭별 콘텐츠 */}
      {activeTab === "weekly" ? (
        <WeeklyReport items={data.items} slack={data.slack} />
      ) : activeTab === "project" && selectedFilter === "전체" ? (
        <ProjectView items={filteredItems} />
      ) : (
        <WorkTable items={filteredItems} />
      )}

      {/* 마지막 업데이트 */}
      <div className="text-right text-xs text-gray-400">
        마지막 업데이트:{" "}
        {new Date(data.lastUpdated).toLocaleString("ko-KR")}
      </div>
    </div>
  );
}
