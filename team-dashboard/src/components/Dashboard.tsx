"use client";

import { useState, useEffect, useMemo } from "react";
import type { DashboardData } from "@/lib/notion";
import type { SlackData } from "@/lib/slack";
import type { ReconciliationResult } from "@/lib/reconciliation";
import type { Alert } from "@/lib/bottlenecks";
import { isDone } from "@/lib/status";
import SummaryCards from "./SummaryCards";
import AttentionRouter from "./AttentionRouter";
import ProjectView from "./ProjectView";
import TeamView from "./TeamView";
import WorkerView from "./WorkerView";
import BriefingView from "./BriefingView";

type DashboardMode = "overview" | "project" | "team" | "worker" | "briefing";

interface ApiResponse extends DashboardData {
  slack: SlackData | null;
  reconciliation: ReconciliationResult[];
  warnings: string[];
  alerts: Alert[];
}

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DashboardMode>("overview");
  const [showCompleted, setShowCompleted] = useState(false);

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

  // Data age check
  const dataAgeWarning = useMemo(() => {
    if (!data) return false;
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    return age > 2 * 60 * 60 * 1000; // 2 hours
  }, [data]);

  // Global filter: exclude completed items
  const filteredItems = useMemo(() => {
    if (!data) return [];
    return showCompleted ? data.items : data.items.filter((i) => !isDone(i.status));
  }, [data, showCompleted]);

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return showCompleted ? data.alerts : data.alerts.filter((a) => !isDone(a.item.status));
  }, [data, showCompleted]);

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

  const tabs: { key: DashboardMode; label: string }[] = [
    { key: "overview", label: "현황 개요" },
    { key: "project", label: "프로젝트별" },
    { key: "team", label: "팀별" },
    { key: "worker", label: "작업자별" },
    { key: "briefing", label: "주간 브리핑" },
  ];

  return (
    <div className="space-y-6">
      {/* 5탭 네비게이션 */}
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              mode === tab.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {(!data.slack || data.slack.messages.length === 0) && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded ml-auto">
            슬랙 미연결
          </span>
        )}
      </div>

      {/* 글로벌 필터 */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          완료 항목 포함
        </label>
        <span className="text-xs text-gray-400">
          {filteredItems.length}건 표시 중{!showCompleted && data.items.length > filteredItems.length && ` (완료 ${data.items.length - filteredItems.length}건 숨김)`}
        </span>
      </div>

      {/* 경고 배너 */}
      {data.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">{w}</p>
          ))}
        </div>
      )}

      {/* 탭별 콘텐츠 */}
      {mode === "overview" && (
        <div className="space-y-6">
          <SummaryCards items={filteredItems} alertCount={filteredAlerts.length} />
          <AttentionRouter items={filteredItems} alerts={filteredAlerts} slack={data.slack ?? undefined} />
        </div>
      )}

      {mode === "project" && (
        <ProjectView
          items={filteredItems}
          reconciliation={data.reconciliation}
          slack={data.slack}
          alerts={filteredAlerts}
        />
      )}

      {mode === "team" && (
        <TeamView items={filteredItems} alerts={filteredAlerts} />
      )}

      {mode === "worker" && (
        <WorkerView items={filteredItems} alerts={filteredAlerts} />
      )}

      {mode === "briefing" && (
        <BriefingView
          items={filteredItems}
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
