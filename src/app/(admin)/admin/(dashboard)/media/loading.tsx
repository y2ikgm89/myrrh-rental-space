/**
 * /admin/media ローディング
 *
 * 画像グリッド形式のメディアライブラリ。
 * 実 UI: header + filters + grid (3-6 col responsive) + pagination。
 */

import { Skeleton } from "@/admin/components/ui";

export default function MediaLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" variant="text" />
          <Skeleton className="h-4 w-72" variant="text" />
        </div>
        <Skeleton className="h-11 w-32" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-full sm:w-40" />
        <Skeleton className="h-11 w-full sm:w-40" />
      </div>

      {/* Media grid (3 / 4 / 6 col responsive) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-3 w-3/4" variant="text" />
            <Skeleton className="h-3 w-1/2" variant="text" />
          </div>
        ))}
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
