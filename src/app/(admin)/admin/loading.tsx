/**
 * 管理画面共通ローディング UI（admin layout 直下）
 *
 * admin/layout.tsx の children を Suspense でラップする。
 * (auth) と (dashboard) 両方のルートグループに適用される共通 fallback。
 * 個別 route の loading.tsx が存在する場合はそちらが優先される。
 */

import { Skeleton } from "@/admin/components/ui";

export default function AdminRootLoading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true">
      {/* Generic page header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" variant="text" />
        <Skeleton className="h-4 w-72" variant="text" />
      </div>

      {/* Generic content blocks */}
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" variant="text" />
          <Skeleton className="h-4 w-11/12" variant="text" />
          <Skeleton className="h-4 w-4/5" variant="text" />
        </div>
      </div>
    </div>
  );
}
