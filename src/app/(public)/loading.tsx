/**
 * 公開ページ汎用ローディング UI（Suspense fallback）
 *
 * 個別 route の loading.tsx が存在する場合はそちらが優先される。
 * 本ファイルは PageHero + 本文セクション 2 つに相当する汎用 skeleton。
 * spinner 単独は perceived wait time が長くなるため avoid pattern。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true">
      {/* Page hero placeholder（中央寄せ minimal variant 相当） */}
      <section className="bg-background py-[var(--spacing-fluid-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-10 w-72 md:h-12 md:w-96" />
            <Skeleton className="h-4 w-full max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      {/* Body content placeholder */}
      <Container>
        <div className="space-y-6 py-[var(--spacing-fluid-lg)]">
          <Skeleton className="h-6 w-48" variant="text" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-11/12" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
            <Skeleton className="h-4 w-3/4" variant="text" />
          </div>
        </div>
      </Container>
    </div>
  );
}
