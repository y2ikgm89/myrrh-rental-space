/**
 * 認証画面ローディング UI（(auth) レイアウト配下）
 *
 * /admin/login / /admin/forgot-password / /admin/reset-password の Suspense fallback。
 * カード型のログインフォームに合わせた skeleton。
 */

import { Skeleton } from "@/admin/components/ui";

export default function AuthLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background p-6"
      aria-busy="true"
    >
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8">
        {/* Title */}
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-7 w-40" variant="text" />
          <Skeleton className="mx-auto h-4 w-56" variant="text" />
        </div>

        {/* Email field */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" variant="text" />
          <Skeleton className="h-11 w-full" />
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" variant="text" />
          <Skeleton className="h-11 w-full" />
        </div>

        {/* Submit button */}
        <Skeleton className="h-11 w-full" />

        {/* Forgot password link */}
        <Skeleton className="mx-auto h-4 w-32" variant="text" />
      </div>
    </div>
  );
}
