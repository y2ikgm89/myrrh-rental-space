/**
 * /about ローディング — page-hero + concept sections (text + image alternating)
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function AboutLoading() {
  return (
    <div aria-busy="true">
      {/* Page hero */}
      <section className="bg-background py-[var(--spacing-fluid-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-48 md:h-12 md:w-72" />
            <Skeleton className="h-4 w-80 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="space-y-[var(--spacing-fluid-lg)] py-[var(--spacing-fluid-lg)]">
          {/* Concept section 1: text + image */}
          <div className="grid gap-8 md:grid-cols-2 md:gap-12 md:items-center">
            <div className="space-y-4">
              <Skeleton className="h-3 w-20" variant="text" />
              <Skeleton className="h-8 w-3/4" variant="text" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-11/12" variant="text" />
                <Skeleton className="h-4 w-4/5" variant="text" />
                <Skeleton className="h-4 w-5/6" variant="text" />
              </div>
            </div>
            <Skeleton className="aspect-[4/3] w-full" />
          </div>

          {/* Concept section 2: image + text (reversed) */}
          <div className="grid gap-8 md:grid-cols-2 md:gap-12 md:items-center">
            <Skeleton className="aspect-[4/3] w-full md:order-2" />
            <div className="space-y-4 md:order-1">
              <Skeleton className="h-3 w-20" variant="text" />
              <Skeleton className="h-8 w-3/4" variant="text" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-11/12" variant="text" />
                <Skeleton className="h-4 w-4/5" variant="text" />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
