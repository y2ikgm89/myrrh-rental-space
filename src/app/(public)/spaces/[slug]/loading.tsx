/**
 * /spaces/[slug] ローディング — gallery + title + info grid + description + reservation widget
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function SpaceDetailLoading() {
  return (
    <main id="main-content" aria-busy="true">
      <Container>
        <div className="space-y-10 py-[var(--space-lg)]">
          {/* Image gallery (main + thumbs) */}
          <div className="grid gap-3 lg:grid-cols-[1fr_120px]">
            <Skeleton className="aspect-[16/9] w-full" />
            <div className="hidden gap-3 lg:flex lg:flex-col">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          </div>

          {/* Two-column: info + reservation widget */}
          <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="space-y-8">
              {/* Title + badges */}
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-10 w-3/4 md:h-12" variant="text" />
                <Skeleton className="h-4 w-1/2" variant="text" />
              </div>

              {/* Info grid (capacity / size / price / etc) */}
              <div className="@container">
                <div className="grid gap-6 @md:grid-cols-2 @3xl:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-16" variant="text" />
                      <Skeleton className="h-6 w-32" variant="text" />
                    </div>
                  ))}
                </div>
              </div>

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
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 8 }, (_, i) => (
                    <Skeleton key={i} className="h-8 w-24 rounded-full" />
                  ))}
                </div>
              </div>
            </div>

            {/* Reservation widget (lg sticky aside) */}
            <aside className="space-y-4 border border-border p-6 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
              <Skeleton className="h-5 w-32" variant="text" />
              <Skeleton className="h-7 w-40" variant="text" />
              <div className="space-y-3 pt-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
              <Skeleton className="h-12 w-full" />
            </aside>
          </div>
        </div>
      </Container>
    </main>
  );
}
