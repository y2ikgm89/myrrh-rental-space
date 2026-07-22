/**
 * /terms ローディング — page-hero + 規約リスト
 *
 * terms-list section の実 UI に揃えた skeleton (faq/loading.tsx と同型)。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function TermsListLoading() {
  return (
    <div aria-busy="true">
      {/* Page hero */}
      <section className="bg-background py-[var(--spacing-fluid-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
            <Skeleton className="h-4 w-72 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="mx-auto max-w-[var(--container-measure)] py-10 md:py-14">
          <ul className="divide-y divide-divider">
            {skeletonKeys(8, "terms-row").map((key) => (
              <li key={key} className="space-y-2 py-6">
                <Skeleton className="h-3 w-32" variant="text" />
                <Skeleton className="h-6 w-2/3" variant="text" />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </div>
  );
}
