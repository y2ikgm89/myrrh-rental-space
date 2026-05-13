/**
 * プレビュー用ローディング UI
 *
 * `(preview)/preview/pages/[slug]` の Suspense fallback。
 * 公開ページの ManagedPageSections render 中の placeholder として
 * 公開ページと同じ skeleton 構造を共有する。
 */

import { Skeleton } from "@/public/components/design-system/skeleton";
import { Container } from "@/public/components/design-system/container";

export default function PreviewLoading() {
  return (
    <main className="min-h-screen bg-background" aria-busy="true">
      {/* Preview banner placeholder */}
      <div className="border-b border-warning/30 bg-warning/5 p-3">
        <Container>
          <Skeleton className="h-4 w-48" variant="text" />
        </Container>
      </div>

      {/* Page hero */}
      <section className="border-b border-border bg-gradient-to-b from-surface via-background to-background py-[var(--space-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-10 w-72 md:h-12 md:w-96" />
            <Skeleton className="h-4 w-full max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      {/* Body content */}
      <Container>
        <div className="space-y-6 py-[var(--space-lg)]">
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
