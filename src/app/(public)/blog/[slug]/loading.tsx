import type { ReactElement } from "react";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function BlogPostLoading(): ReactElement {
  return (
    <div>
      <div className="bg-surface py-3">
        <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]">
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)] py-12">
        <Skeleton className="mb-3 h-4 w-12" />
        <Skeleton className="mb-4 h-9 w-3/4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)] pb-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full last:w-4/5" />
            ))}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-6 space-y-2">
              <Skeleton className="h-5 w-24" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
