/**
 * /posts/preview/[slug] ローディング — ArticleHeader + Prose body skeleton
 * （preview なので sidebar / CTA はなし）
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function PostPreviewLoading() {
  return (
    <main id="main-content" aria-busy="true">
      <Container>
        <article className="mx-auto max-w-[var(--container-measure)] space-y-12 py-[var(--space-lg)]">
          {/* Preview banner */}
          <div className="border border-warning/30 bg-warning/5 p-3">
            <Skeleton className="h-4 w-48" variant="text" />
          </div>

          {/* Article header */}
          <header className="space-y-6">
            <Skeleton className="h-10 w-11/12 md:h-12" variant="text" />
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-3 w-20" variant="text" />
              <Skeleton className="h-3 w-32" variant="text" />
            </div>
            <Skeleton className="aspect-video w-full" />
          </header>

          {/* Body */}
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-11/12" variant="text" />
            <Skeleton className="h-4 w-5/6" variant="text" />
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
            <Skeleton className="h-4 w-3/4" variant="text" />
          </div>
        </article>
      </Container>
    </main>
  );
}
