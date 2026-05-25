/**
 * /spaces/[slug] ローディング — ArticleLayout hero full-width 構造に同期
 * (breadcrumb 帯 → article header full-width → body 2-col + sticky aside)
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function SpaceDetailLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Breadcrumb 帯 (ArticleLayout の bg-surface band と同形) */}
      <div className="bg-surface py-2 shadow-inner">
        <Container>
          <Skeleton className="h-5 w-64" variant="text" />
        </Container>
      </div>

      <Container className="pt-10 pb-[var(--space-lg)] md:pt-14">
        {/* Hero block (full-width within article) */}
        <header className="mb-12 space-y-8">
          <div className="space-y-6">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-3/4 md:h-12" variant="text" />
            <Skeleton className="h-px w-16" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-5 w-16" variant="text" />
              <Skeleton className="h-5 w-12" variant="text" />
            </div>
          </div>
          <Skeleton className="aspect-video w-full" />
        </header>

        {/* Body grid: SpaceInfo body + sticky reservation widget */}
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-16">
          <div className="min-w-0 space-y-10">
            {/* lineAddress */}
            <Skeleton className="h-4 w-1/2" variant="text" />

            {/* Description */}
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" variant="text" />
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-11/12" variant="text" />
              <Skeleton className="h-4 w-4/5" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>

            {/* Facilities */}
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" variant="text" />
              <div className="@container">
                <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Reservation widget (lg sticky aside) */}
          <aside className="mt-10 hidden space-y-4 border border-border p-6 lg:mt-0 lg:block lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:self-start">
            <Skeleton className="h-5 w-32" variant="text" />
            <Skeleton className="h-7 w-40" variant="text" />
            <div className="space-y-3 pt-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </aside>
        </div>
      </Container>
    </main>
  );
}
