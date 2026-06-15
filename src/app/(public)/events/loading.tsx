/**
 * /events ローディング — page-hero + tab + event list (date + venue + title)
 *
 * event-list view の実 UI に揃えた skeleton。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function EventsLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero */}
      <section className="bg-background py-[var(--space-xl)]">
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
          {/* Tabs */}
          <nav
            aria-label="イベントタブ"
            className="flex gap-6 border-b border-divider pb-3"
          >
            <Skeleton className="h-5 w-20" variant="text" />
            <Skeleton className="h-5 w-24" variant="text" />
            <Skeleton className="h-5 w-20" variant="text" />
          </nav>

          {/* Event list (5 items with hairline dividers) */}
          <div className="divide-y divide-divider">
            {skeletonKeys(5, "event-item").map((key) => (
              <article
                key={key}
                className="flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:gap-8"
              >
                <Skeleton className="aspect-[4/3] w-full shrink-0 sm:h-32 sm:w-48" />
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <Skeleton className="h-3 w-28" variant="text" />
                    <Skeleton className="h-3 w-24" variant="text" />
                  </div>
                  <Skeleton className="h-6 w-3/4" variant="text" />
                  <Skeleton className="h-4 w-full" variant="text" />
                  <Skeleton className="h-4 w-4/5" variant="text" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
