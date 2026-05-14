/**
 * /access ローディング — page-hero + location chapters (alternating chapter blocks)
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function AccessLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero */}
      <section className="border-b border-border bg-background py-[var(--space-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-32 md:h-12 md:w-48" />
            <Skeleton className="h-4 w-72 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="space-y-[var(--space-xl)] py-[var(--space-lg)]">
          {/* 2 Location chapters */}
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-8">
              {/* Chapter header */}
              <div className="space-y-3 text-center">
                <Skeleton className="mx-auto h-3 w-24" variant="text" />
                <Skeleton
                  className="mx-auto h-8 w-2/3 max-w-md"
                  variant="text"
                />
              </div>

              {/* Map + info pair */}
              <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
                <Skeleton className="h-[320px] w-full md:h-[400px]" />
                <div className="space-y-4">
                  <Skeleton className="h-5 w-32" variant="text" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" variant="text" />
                    <Skeleton className="h-4 w-11/12" variant="text" />
                    <Skeleton className="h-4 w-4/5" variant="text" />
                  </div>
                  <div className="space-y-2 pt-4">
                    <Skeleton className="h-5 w-24" variant="text" />
                    <Skeleton className="h-4 w-full" variant="text" />
                    <Skeleton className="h-4 w-3/4" variant="text" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
