/**
 * /reservation ローディング — page-hero + StepIndicator + 3-step wizard form
 *
 * reservation-form section の実 UI に揃えた skeleton。
 * 3 ステップウィザード（スペース選択 → 日時 → 確認）の最初のステップを反映。
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export default function ReservationLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero (compact variant) */}
      <section className="bg-background py-[var(--spacing-fluid-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-56 md:h-12 md:w-72" />
            <Skeleton className="h-4 w-80 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="mx-auto max-w-3xl space-y-10 py-10 md:py-14">
          {/* StepIndicator (3 steps) */}
          <div
            className="flex items-center justify-between gap-2"
            aria-label="ステップインジケーター"
          >
            {skeletonKeys(3, "step").map((key, i) => (
              <div key={key} className="flex flex-1 items-center gap-3">
                <Skeleton className="h-10 w-10" variant="circle" />
                <Skeleton className="hidden h-4 w-20 sm:block" variant="text" />
                {i < 2 && <Skeleton className="h-px flex-1" />}
              </div>
            ))}
          </div>

          {/* Selection / form fields */}
          <div className="space-y-6 border border-border p-6 sm:p-8">
            <Skeleton className="h-6 w-48" variant="text" />

            {/* Space selector cards (3) */}
            <div className="space-y-3">
              {skeletonKeys(3, "space-option").map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-4 border border-border p-4"
                >
                  <Skeleton className="h-20 w-20 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" variant="text" />
                    <Skeleton className="h-4 w-1/2" variant="text" />
                    <Skeleton className="h-3 w-1/3" variant="text" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit button */}
          <div className="flex justify-end">
            <Skeleton className="h-12 w-48" />
          </div>
        </div>
      </Container>
    </main>
  );
}
