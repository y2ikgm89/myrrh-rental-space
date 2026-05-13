/**
 * (dashboard) ルートグループの汎用ローディング UI
 *
 * dashboard layout 配下の全ページの Suspense fallback。
 * ダッシュボードトップは独自 page.tsx 内で section 単位の Suspense fallback を
 * 持つため、本ファイルは「リスト系 admin ページ全般」の汎用 fallback を提供する。
 * - page header (title + subtitle + action)
 * - filter bar
 * - table 5 rows
 * - pagination
 */

import { Skeleton } from "@/admin/components/ui";

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" variant="text" />
          <Skeleton className="h-4 w-72" variant="text" />
        </div>
        <Skeleton className="h-11 w-32" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-full sm:w-40" />
        <Skeleton className="h-11 w-full sm:w-32" />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {/* Table header */}
        <div className="grid grid-cols-4 gap-4 border-b px-6 py-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-24" variant="text" />
          ))}
        </div>
        {/* Table rows */}
        <div className="divide-y">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="grid grid-cols-4 items-center gap-4 px-6 py-4"
            >
              <Skeleton className="h-4 w-32" variant="text" />
              <Skeleton className="h-4 w-24" variant="text" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="ml-auto h-9 w-9" />
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" variant="text" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-11" />
          <Skeleton className="h-11 w-11" />
          <Skeleton className="h-11 w-11" />
        </div>
      </div>
    </div>
  );
}
