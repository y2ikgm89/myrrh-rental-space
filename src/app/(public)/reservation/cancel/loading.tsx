/**
 * /reservation/cancel ローディング
 *
 * 親 (reservation/loading.tsx) は 3 ステップ予約ウィザードの skeleton のため、
 * キャンセル確認ページではそれが誤って表示される。確認ページの実 UI
 * （予約サマリーカード ＋ 確定フォーム）に揃えた skeleton で上書きする。
 */

import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function GuestCancelLoading() {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl" aria-busy="true">
        <Heading level={1}>予約のキャンセル</Heading>

        {/* 予約サマリーカード */}
        <div className="border border-border">
          <div className="space-y-2 border-b border-border p-4 sm:p-6">
            <Skeleton className="h-6 w-1/2" variant="text" />
            <Skeleton className="h-4 w-24" variant="text" />
          </div>
          <div className="px-4 sm:px-6">
            {skeletonKeys(3, "summary-row").map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-none"
              >
                <Skeleton className="h-4 w-20" variant="text" />
                <Skeleton className="h-4 w-40" variant="text" />
              </div>
            ))}
          </div>
        </div>

        {/* 確定フォーム */}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-40" />
      </Stack>
    </PageLayout>
  );
}
