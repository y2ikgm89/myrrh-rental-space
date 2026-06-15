/**
 * /admin/faq ローディング
 *
 * FAQ master-detail のマスター側（カテゴリ一覧 DnD カード）。
 * 実 UI: header + action buttons + DnD card list。
 */

import { Skeleton } from "@/admin/components/ui";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function FaqLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" variant="text" />
          <Skeleton className="h-4 w-64" variant="text" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>

      {/* Category list (DnD cards) */}
      <div className="space-y-3">
        {skeletonKeys(6, "faq-card").map((key) => (
          <div
            key={key}
            className="flex items-center gap-4 rounded-lg border bg-card p-4"
          >
            {/* Drag handle */}
            <Skeleton className="h-5 w-5 shrink-0" />
            {/* Content */}
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3" variant="text" />
              <Skeleton className="h-4 w-2/3" variant="text" />
            </div>
            {/* Count badge */}
            <Skeleton className="h-6 w-16 rounded-full" />
            {/* Actions */}
            <Skeleton className="h-9 w-9" />
          </div>
        ))}
      </div>
    </div>
  );
}
