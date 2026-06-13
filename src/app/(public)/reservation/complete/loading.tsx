/**
 * /reservation/complete ローディング
 *
 * 親 (reservation/loading.tsx) は 3 ステップ予約ウィザードの skeleton のため、
 * 完了ページではそれが誤って表示される。完了ページの実 UI（成功見出し ＋ 予約サマリー
 * カード ＋ 次のステップ）に揃えた skeleton で上書きする。
 */

import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function ReservationCompleteLoading() {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl" aria-busy="true">
        {/* 成功見出し */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Skeleton className="h-3 w-20" variant="text" />
          <Skeleton className="h-9 w-72 md:h-10" />
          <Skeleton className="h-4 w-full max-w-sm" variant="text" />
        </div>

        {/* 予約サマリーカード */}
        <div className="border border-border">
          <div className="border-b border-border p-4 sm:p-6">
            <Skeleton className="h-6 w-1/2" variant="text" />
          </div>
          <div className="px-4 sm:px-6">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-none"
              >
                <Skeleton className="h-4 w-20" variant="text" />
                <Skeleton className="h-4 w-40" variant="text" />
              </div>
            ))}
          </div>
        </div>

        {/* 次のステップ */}
        <Skeleton className="h-28 w-full" />
      </Stack>
    </PageLayout>
  );
}
