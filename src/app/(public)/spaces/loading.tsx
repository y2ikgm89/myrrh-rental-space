/**
 * /spaces ローディング — page-hero + filter bar + SpaceCard grid (catalog variant)
 *
 * space-list catalog variant の実 UI に揃えた skeleton。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function SpacesLoading() {
  return (
    <div aria-busy="true">
      {/* Page hero */}
      <section className="bg-background py-[var(--spacing-fluid-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
            <Skeleton className="h-4 w-80 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="space-y-8 py-10 md:py-14">
          {/* Filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 w-full sm:w-40" />
            <Skeleton className="h-11 w-full sm:w-40" />
          </div>

          {/* Space card grid (4 cards, catalog) */}
          <div className="@container">
            <div className="grid gap-6 @md:grid-cols-2 @md:gap-8 @3xl:grid-cols-3">
              {skeletonKeys(4, "space-card").map((key) => (
                <div key={key} className="space-y-3 border border-border">
                  <Skeleton className="aspect-[3/2] w-full rounded-none" />
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-5 w-3/4" variant="text" />
                    <Skeleton className="h-4 w-1/2" variant="text" />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-14 rounded-full" />
                    </div>
                    <div className="flex items-baseline justify-between pt-2">
                      <Skeleton className="h-3 w-20" variant="text" />
                      <Skeleton className="h-5 w-24" variant="text" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
