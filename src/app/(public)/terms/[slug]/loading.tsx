/**
 * /terms/[slug] ローディング — Breadcrumb 帯 + ArticleHeader + Prose body
 *
 * terms 詳細は sidebar なしの editorial layout（news/[slug]/loading.tsx と同形）。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function TermsDetailLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Breadcrumb band */}
      <div className="border-b border-divider bg-surface">
        <Container>
          <div className="flex items-center gap-2 py-3">
            <Skeleton className="h-3 w-12" variant="text" />
            <Skeleton className="h-3 w-3" variant="text" />
            <Skeleton className="h-3 w-20" variant="text" />
            <Skeleton className="h-3 w-3" variant="text" />
            <Skeleton className="h-3 w-32" variant="text" />
          </div>
        </Container>
      </div>

      <Container>
        <article className="mx-auto max-w-[var(--container-measure)] space-y-12 py-[var(--spacing-fluid-lg)]">
          {/* Article header */}
          <header className="space-y-6">
            <Skeleton className="h-10 w-11/12 md:h-12" variant="text" />
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-3 w-32" variant="text" />
            </div>
          </header>

          {/* Body */}
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-11/12" variant="text" />
            <Skeleton className="h-4 w-5/6" variant="text" />
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
            <Skeleton className="h-4 w-3/4" variant="text" />

            <div className="space-y-4 pt-4">
              <Skeleton className="h-6 w-2/3" variant="text" />
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-11/12" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>
          </div>
        </article>
      </Container>
    </main>
  );
}
