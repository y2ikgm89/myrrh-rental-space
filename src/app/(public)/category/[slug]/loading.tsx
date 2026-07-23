import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

// TaxonomyArchiveView（category/tag 共通）のスケルトン。/blog archive と異なり
// 検索バー・カテゴリフィルタ chips を持たない（分類は URL パスで確定済みのため）。
export default function CategoryArchiveLoading(): ReactElement {
  return (
    <div aria-busy="true" aria-label="カテゴリ記事一覧を読み込み中">
      <Container>
        <div className="py-[var(--spacing-fluid-xl)]">
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
          </div>

          <div className="@container mt-10 md:mt-14">
            <div className="grid gap-6 @sm:grid-cols-2 @sm:gap-8 @3xl:grid-cols-3">
              {skeletonKeys(6, "category-card").map((key) => (
                <div key={key} className="space-y-3 border border-border">
                  <Skeleton className="aspect-[4/3] w-full rounded-none" />
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-3 w-20" variant="text" />
                    <Skeleton className="h-5 w-11/12" variant="text" />
                    <Skeleton className="h-5 w-3/4" variant="text" />
                    <Skeleton className="h-3 w-full" variant="text" />
                    <Skeleton className="h-3 w-4/5" variant="text" />
                    <div className="flex items-center justify-between pt-2">
                      <Skeleton className="h-3 w-24" variant="text" />
                      <Skeleton className="h-3 w-16" variant="text" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <nav
            aria-label="ページネーション"
            className="flex justify-center gap-2 pt-8"
          >
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
          </nav>
        </div>
      </Container>
    </div>
  );
}
