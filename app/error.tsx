"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl border border-red-200 bg-white px-6 py-8 shadow-sm">
          <p className="text-sm font-semibold text-red-600">대시보드 오류</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            페이지를 불러오지 못했습니다.
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            프로젝트 상세를 포함한 일부 데이터 형식이 예상과 다를 수 있습니다.
          </p>
          {process.env.NODE_ENV !== "production" && error.message && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-mono text-red-700 break-all">
              {error.message}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700"
            >
              다시 시도
            </button>
            <a
              href="/"
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700"
            >
              홈으로
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
