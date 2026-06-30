/**
 * IAP 後の補助画面ローディング UI（(auth) レイアウト配下）。
 */

import { Skeleton } from "@/admin/components/ui";

export default function AuthLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background p-6"
      aria-busy="true"
    >
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8">
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-7 w-40" variant="text" />
          <Skeleton className="mx-auto h-4 w-56" variant="text" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
