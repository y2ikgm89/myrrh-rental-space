/**
 * /admin/reservations/calendar ローディング
 *
 * Calendar view（Resource / Month / Week / Day）の共通 fallback。
 * 実 UI: Breadcrumb + Toolbar (view tabs + filters + navigation) + Calendar grid。
 */

import { Skeleton } from "@/admin/components/ui";

export default function CalendarLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4" aria-busy="true">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-12" variant="text" />
        <Skeleton className="h-3 w-3" variant="text" />
        <Skeleton className="h-3 w-24" variant="text" />
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" variant="text" />
        <Skeleton className="h-11 w-32" />
      </div>

      {/* Calendar toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: view tabs */}
        <div className="flex gap-1">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
        </div>
        {/* Center: navigation */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-16" />
        </div>
        {/* Right: filters */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Calendar grid (month view default — 7 cols × 6 rows) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {/* Day labels */}
        <div className="grid shrink-0 grid-cols-7 border-b">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="px-3 py-2">
              <Skeleton className="h-4 w-8" variant="text" />
            </div>
          ))}
        </div>
        {/* Week rows */}
        <div className="grid flex-1 grid-cols-7 grid-rows-6 divide-x divide-y">
          {Array.from({ length: 42 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1 p-2">
              <Skeleton className="h-3 w-6" variant="text" />
              {i % 5 === 0 && <Skeleton className="h-5 w-full" />}
              {i % 7 === 3 && <Skeleton className="h-5 w-full" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
