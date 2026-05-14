/**
 * /access/[locationSlug] ローディング — page-hero + map + location info chapters
 */

import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function LocationDetailLoading(): ReactElement {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero */}
      <section className="border-b border-border bg-background py-[var(--space-lg)]">
        <Container>
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <Skeleton className="mx-auto h-3 w-24" variant="text" />
            <Skeleton className="mx-auto h-10 w-2/3 md:h-12" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="space-y-[var(--space-lg)] py-[var(--space-lg)]">
          {/* Hero image */}
          <Skeleton className="aspect-[3/2] w-full" />

          {/* Map + info pair */}
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <Skeleton className="h-[400px] w-full" />
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" variant="text" />
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-3/4" variant="text" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" variant="text" />
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-2/3" variant="text" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" variant="text" />
                <Skeleton className="h-4 w-1/2" variant="text" />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
