/**
 * /events/[slug] ローディング — page-hero + event info card + description
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function EventDetailLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero (compact) */}
      <section className="border-b border-border bg-background py-[var(--space-lg)]">
        <Container>
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <Skeleton className="mx-auto h-3 w-20" variant="text" />
            <Skeleton className="mx-auto h-10 w-3/4 md:h-12" variant="text" />
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className="mx-auto max-w-3xl space-y-10 py-[var(--space-lg)]">
          {/* Hero image */}
          <Skeleton className="aspect-video w-full" />

          {/* Event info card */}
          <div className="space-y-4 border border-border p-6">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-5 w-5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-16" variant="text" />
                  <Skeleton className="h-5 w-2/3" variant="text" />
                </div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" variant="text" />
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-11/12" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
            <Skeleton className="h-4 w-3/4" variant="text" />
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-12 w-full sm:w-48" />
            <Skeleton className="h-12 w-full sm:w-48" />
          </div>
        </div>
      </Container>
    </main>
  );
}
