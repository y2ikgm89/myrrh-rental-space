import { Skeleton } from "@/admin/components/ui";

/**
 * 管理画面 詳細ページの共通ローディング UI。
 *
 * 14 件の `[id]/loading.tsx` の SSoT。`AdminDetailLayout` の実 UI に揃えた構造:
 * - back button row
 * - header: title + subtitle + action buttons
 * - content: card with detail fields
 */
export default function DetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Back button */}
      <Skeleton className="h-9 w-32" />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" variant="text" />
          <Skeleton className="h-4 w-48" variant="text" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-24" />
          <Skeleton className="h-11 w-24" />
        </div>
      </div>

      {/* Detail card with field rows */}
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-5">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <Skeleton className="h-4 w-32 shrink-0" variant="text" />
              <Skeleton className="h-4 flex-1" variant="text" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
