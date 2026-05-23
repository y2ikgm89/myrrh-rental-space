/**
 * /posts ローディング — page-hero + SearchBar + Category Filter + 6 PostCard grid + Pagination
 *
 * post-list archive variant の実 UI に揃えた skeleton。
 * spinner 単独は実カード形状が判らず perceived wait time が長くなるため avoid。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function PostsLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero (StandardHeroSection minimal variant) */}
      <section className="bg-background py-[var(--space-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
            <Skeleton className="h-4 w-72 max-w-md" variant="text" />
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

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>

          {/* Post grid (6 cards, 1/2/3 col responsive) */}
          <div className="@container">
            <div className="grid gap-6 @sm:grid-cols-2 @sm:gap-8 @3xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-3 border border-border">
                  <Skeleton className="aspect-[4/3] w-full rounded-none" />
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-3 w-20" variant="text" />
                    <Skeleton className="h-5 w-11/12" variant="text" />
                    <Skeleton className="h-5 w-3/4" variant="text" />
                    <Skeleton className="h-3 w-full" variant="text" />
                    <Skeleton className="h-3 w-4/5" variant="text" />
                    <div className="flex items-center justify-between pt-2">
                      <Skeleton className="h-3 w-24" variant="text" />
                      <Skeleton className="h-3 w-16" variant="text" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <nav
            aria-label="ページネーション"
            className="flex justify-center gap-2 pt-4"
          >
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
            <Skeleton className="h-11 w-11" />
          </nav>
        </div>
      </Container>
    </main>
  );
}
