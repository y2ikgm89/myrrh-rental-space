/**
 * /terms ローディング — ArticleLayout (showSidebar=false) + Breadcrumb 帯 + h1 + 規約リスト
 *
 * terms/page.tsx の実 UI に揃えた skeleton。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function TermsListLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Breadcrumb band */}
      <div className="border-b border-divider bg-surface">
        <Container>
          <div className="flex items-center gap-2 py-3">
            <Skeleton className="h-3 w-12" variant="text" />
            <Skeleton className="h-3 w-3" variant="text" />
            <Skeleton className="h-3 w-20" variant="text" />
          </div>
        </Container>
      </div>

      <Container>
        <div className="mx-auto max-w-[var(--container-measure)] space-y-8 py-[var(--space-lg)]">
          {/* h1 */}
          <Skeleton className="h-10 w-48 md:h-12 md:w-64" variant="text" />

          {/* List rows */}
          <ul className="divide-y divide-divider">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2 py-6">
                <Skeleton className="h-3 w-32" variant="text" />
                <Skeleton className="h-6 w-2/3" variant="text" />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </main>
  );
}
