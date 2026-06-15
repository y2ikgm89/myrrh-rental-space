/**
 * /faq ローディング — page-hero + accordion list (6 items)
 *
 * faq-list section の実 UI に揃えた skeleton。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function FaqLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero */}
      <section className="bg-background py-[var(--space-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-32 md:h-12 md:w-48" />
            <Skeleton className="h-4 w-72 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="mx-auto max-w-3xl py-10 md:py-14">
          {/* Accordion rows */}
          <div className="divide-y divide-divider">
            {skeletonKeys(6, "faq-row").map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 py-5"
              >
                <Skeleton className="h-5 flex-1" variant="text" />
                <Skeleton className="h-5 w-5 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
