/**
 * /[...segments] カスタムページのローディング
 *
 * Dynamic Section Architecture により内容が事前に判らないため、
 * page-hero + 汎用本文セクションの skeleton で代用。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function SegmentsLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero placeholder */}
      <section className="bg-background py-[var(--spacing-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-10 w-72 md:h-12 md:w-96" />
            <Skeleton className="h-4 w-full max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      {/* Generic content section */}
      <Container>
        <div className="space-y-6 py-[var(--spacing-lg)]">
          <Skeleton className="h-6 w-48" variant="text" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-11/12" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
            <Skeleton className="h-4 w-3/4" variant="text" />
          </div>
        </div>
      </Container>
    </main>
  );
}
