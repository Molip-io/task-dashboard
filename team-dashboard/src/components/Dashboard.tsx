"use client";

import { useState, useEffect, useMemo } from "react";
import type { DashboardData, WorkItem } from "@/lib/notion";
import type { SlackData } from "@/lib/slack";
import type { ReconciliationResult } from "@/lib/reconciliation";
import SummaryCards from "./SummaryCards";
import WorkTable from "./WorkTable";
import ProjectView from "./ProjectView";
import BriefingView from "./BriefingView";

type DashboardMode = "status" | "briefing";
type FilterType = "team" | "project" | "assignee";

interface ApiResponse extends DashboardData {
  slack: SlackData | null;
  reconciliation: ReconciliationResult[];
  warnings: string[];
}

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DashboardMode>("status");
  const [filterType, setFilterType] = useState<FilterType>("team");
  const [filterValue, setFilterValue] = useState<string>("전체");
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("데이터 로딩 실패");
        return res.json();
      })
      .then((d: ApiResponse) => {
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
    switch (filterType) {
      case "team":
        return data.teams;
      case "project":
        return data.projects;
      case "assignee":
        return data.assignees;
    }
  }, [data, filterType]);

  const filteredItems = useMemo((): WorkItem[] => {
    if (!data) return [];
    if (filterValue === "전체") return data.items;
    return data.items.filter((item) => {
      switch (filterType) {
        case "team":
          return item.team === filterValue;
        case "project":
          return item.project === filterValue;
        case "assignee":
          return item.assignee === filterValue;
      }
    });
  }, [data, filterType, filterValue]);

  // 주의 필요: conflict items sorted by confidence
  const conflicts = useMemo(() => {
    if (!data) return [];
    const confOrder = { high: 0, medium: 1, low: 2 };
    return data.reconciliation
      .filter((r) => r.conflict)
      .sort((a, b) => confOrder[a.confidence] - confOrder[b.confidence]);
  }, [data]);

  // 필터 타입 변경시 필터값 리셋
  const handleFilterTypeChange = (ft: FilterType) => {
    setFilterType(ft);
    setFilterValue("전체");
  };

  // 글로벌 검색: 프로젝트명 매칭 시 프로젝트 필터로 자동 이동
  const handleGlobalSearch = (query: string) => {
    setGlobalSearch(query);
    if (!data || !query) return;

    const q = query.toLowerCase();
    const matchedProject = data.projects.find((p) => p.toLowerCase().includes(q));
    if (matchedProject) {
      setFilterType("project");
      setFilterValue(matchedProject);
      return;
    }
    const matchedTeam = data.teams.find((t) => t.toLowerCase().includes(q));
    if (matchedTeam) {
      setFilterType("team");
      setFilterValue(matchedTeam);
      return;
    }
    setFilterValue("전체");
  };

  // Feedback persistence
  const saveFeedback = (itemId: string, vote: "up" | "down") => {
    const key = "reconciliation-feedback";
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    stored[itemId] = { vote, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(stored));
  };

  // Data age check
  const dataAgeWarning = useMemo(() => {
    if (!data) return false;
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    return age > 2 * 60 * 60 * 1000; // 2 hours
  }, [data]);

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
      {/* 모드 토글 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode("status")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "status"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          현황판
        </button>
        <button
          onClick={() => setMode("briefing")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "briefing"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          주간 브리핑
        </button>
        {(!data.slack || data.slack.messages.length === 0) && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
            슬랙 미연결
          </span>
        )}
      </div>

      {/* 경고 배너 */}
      {data.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">{w}</p>
          ))}
        </div>
      )}

      {/* 모드별 콘텐츠 */}
      {mode === "status" ? (
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
                onClick={() => {
                  setGlobalSearch("");
                  setFilterValue("전체");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                Clear
              </button>
            )}
          </div>

          {/* 요약 카드 */}
          <SummaryCards items={filteredItems} />

          {/* 필터 바 */}
          <div className="flex flex-wrap items-center gap-2">
            {(["team", "project", "assignee"] as const).map((ft) => {
              const label = ft === "team" ? "팀별" : ft === "project" ? "프로젝트별" : "담당자별";
              return (
                <button
                  key={ft}
                  onClick={() => handleFilterTypeChange(ft)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterType === ft
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}

            {/* 필터 드롭다운 (프로젝트 전체 뷰에서는 숨김) */}
            {!(filterType === "project" && filterValue === "전체") && (
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
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

          {/* 주의 필요 */}
          {conflicts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-red-700">주의 필요 ({conflicts.length})</h3>
              {conflicts.slice(0, 5).map((r) => (
                <div key={r.item.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <a href={r.item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-red-800 hover:underline">
                      {r.item.title}
                    </a>
                    <div className="text-xs text-red-600 mt-0.5">
                      {r.item.project} · {r.item.assignee} · {r.conflictReason}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                    r.confidence === "high" ? "bg-red-200 text-red-800" :
                    r.confidence === "medium" ? "bg-amber-200 text-amber-800" :
                    "bg-gray-200 text-gray-600"
                  }`}>
                    {r.confidence}
                  </span>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button
                      onClick={(e) => { e.preventDefault(); saveFeedback(r.item.id, "up"); }}
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-green-100"
                      title="정확한 감지"
                    >👍</button>
                    <button
                      onClick={(e) => { e.preventDefault(); saveFeedback(r.item.id, "down"); }}
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-red-100"
                      title="오탐"
                    >👎</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 작업 테이블 / 프로젝트 뷰 */}
          {filterType === "project" && filterValue === "전체" ? (
            <ProjectView items={filteredItems} reconciliation={data.reconciliation} slack={data.slack} />
          ) : (
            <WorkTable items={filteredItems} />
          )}
        </div>
      ) : (
        <BriefingView
          items={data.items}
          slack={data.slack}
          reconciliation={data.reconciliation}
        />
      )}

      {/* 마지막 업데이트 */}
      <div className="text-right text-xs text-gray-400">
        마지막 업데이트:{" "}
        {new Date(data.lastUpdated).toLocaleString("ko-KR")}
        {dataAgeWarning && (
          <span className="ml-2 text-amber-500 font-medium">
            (2시간 이상 지남 — 데이터가 오래되었을 수 있습니다)
          </span>
        )}
      </div>
    </div>
  );
}
