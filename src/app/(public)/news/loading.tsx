/**
 * /news ローディング — page-hero + SearchBar + 8 行リスト + Pagination
 *
 * news-list archive variant の実 UI に揃えた skeleton。
 * editorial hairline `divide-y divide-divider` の構造を反映。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function NewsLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero (StandardHeroSection minimal variant) */}
      <section className="border-b border-border bg-gradient-to-b from-surface via-background to-background py-[var(--space-xl)]">
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
          {/* SearchBar */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 w-full sm:w-32" />
          </div>

          {/* News list with hairline dividers (8 rows) */}
          <div className="divide-y divide-divider">
            {Array.from({ length: 8 }, (_, i) => (
              <article
                key={i}
                className="flex flex-col gap-2 py-5 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <Skeleton className="h-3 w-24 shrink-0" variant="text" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-11/12" variant="text" />
                  <Skeleton className="h-4 w-4/5" variant="text" />
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          <nav
            aria-label="ページネーション"
            className="flex justify-center gap-2 pt-4"
          >
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
          </nav>
        </div>
      </Container>
    </main>
  );
}
