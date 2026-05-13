/**
 * /admin/settings ローディング
 *
 * Settings ハブ（カテゴリカード一覧）の fallback。
 * 実 UI: header + 8 カテゴリカード（3 col grid）。
 */

import { Skeleton } from "@/admin/components/ui";

export default function SettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" variant="text" />
        <Skeleton className="h-4 w-64" variant="text" />
      </div>

      {/* Category cards (1/2/3 col responsive) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border bg-card p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" variant="text" />
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-3/4" variant="text" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
