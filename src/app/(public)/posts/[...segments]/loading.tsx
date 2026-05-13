/**
 * /posts/[...segments] ローディング — Breadcrumb 帯 + ArticleHeader + Prose body + Sidebar
 *
 * ArticleLayout の実 UI に揃えた skeleton。
 * breadcrumb band → article (h1 + meta + thumbnail) → body → sidebar の構造を反映。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function PostDetailLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Breadcrumb band */}
      <div className="border-b border-divider bg-surface">
        <Container>
          <div className="flex items-center gap-2 py-3">
            <Skeleton className="h-3 w-12" variant="text" />
            <Skeleton className="h-3 w-3" variant="text" />
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-3 w-3" variant="text" />
            <Skeleton className="h-3 w-32" variant="text" />
          </div>
        </Container>
      </div>

      <Container>
        <div className="grid gap-12 py-[var(--space-lg)] lg:grid-cols-[1fr_280px]">
          {/* Article body */}
          <article className="space-y-12">
            {/* Article header */}
            <header className="space-y-8">
              <div className="space-y-6">
                <Skeleton className="h-10 w-11/12 md:h-12" variant="text" />
                <div className="flex flex-wrap items-center gap-3">
                  <Skeleton className="h-3 w-20" variant="text" />
                  <Skeleton className="h-3 w-32" variant="text" />
                </div>
              </div>
              <Skeleton className="aspect-video w-full" />
            </header>

            {/* Prose body */}
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-11/12" variant="text" />
              <Skeleton className="h-4 w-5/6" variant="text" />
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-4/5" variant="text" />
              <Skeleton className="h-4 w-11/12" variant="text" />
              <Skeleton className="h-4 w-2/3" variant="text" />
            </div>

            {/* Section break */}
            <div className="space-y-4 pt-4">
              <Skeleton className="h-7 w-2/3" variant="text" />
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-5/6" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>
          </article>

          {/* Sidebar (lg+) */}
          <aside className="hidden space-y-6 lg:block">
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" variant="text" />
              <Skeleton className="h-11 w-full" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" variant="text" />
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="aspect-square w-20 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-full" variant="text" />
                      <Skeleton className="h-3 w-2/3" variant="text" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </main>
  );
}
