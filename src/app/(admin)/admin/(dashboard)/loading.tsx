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
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function DashboardLoading() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="読み込み中"
    >
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

      {/* Table (mobile: 2 cols, sm: 3 cols, md+: 4 cols) — real Table has overflow-auto SSoT, skeleton mirrors that responsively */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          {/* Table header */}
          <div className="grid grid-cols-2 gap-4 border-b px-6 py-3 sm:grid-cols-3 md:grid-cols-4">
            {skeletonKeys(4, "col").map((key) => (
              <Skeleton key={key} className="h-4 w-24" variant="text" />
            ))}
          </div>
          {/* Table rows */}
          <div className="divide-y">
            {skeletonKeys(5, "row").map((key) => (
              <div
                key={key}
                className="grid grid-cols-2 items-center gap-4 px-6 py-4 sm:grid-cols-3 md:grid-cols-4"
              >
                <Skeleton className="h-4 w-32" variant="text" />
                <Skeleton className="h-4 w-24" variant="text" />
                <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
                <Skeleton className="ml-auto hidden h-9 w-9 md:block" />
              </div>
            ))}
          </div>
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
