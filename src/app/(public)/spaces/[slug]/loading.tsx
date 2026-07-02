/**
 * /spaces/[slug] ローディング — Variant E (Booking 構造 × Editorial brand) に同期
 * (breadcrumb 帯 → centered hero header → gallery mosaic + sticky widget → editorial body)
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function SpaceDetailLoading() {
  return (
    <div aria-busy="true">
      {/* Breadcrumb 帯 */}
      <div className="bg-surface py-2 shadow-inner">
        <Container>
          <Skeleton className="h-5 w-64" variant="text" />
        </Container>
      </div>

      {/* Hero header (Kinfolk magazine cover: 中央寄せ) */}
      <header className="mx-auto max-w-[var(--container-site)] px-6 pt-12 text-center md:px-12 md:pt-16">
        <Skeleton className="mx-auto h-3 w-16" variant="text" />
        <Skeleton className="mx-auto mt-5 h-12 w-1/2 md:h-14" variant="text" />
        <Skeleton className="mx-auto mt-6 h-px w-12" />
      </header>

      {/* Gallery mosaic + sticky widget */}
      <div className="mx-auto mt-12 grid max-w-[var(--container-site)] gap-6 px-6 md:px-12 lg:grid-cols-[1fr_320px] lg:gap-10">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-2">
          <Skeleton className="aspect-[4/3] w-full md:col-span-2 md:row-span-2 md:aspect-auto md:h-[440px]" />
          <Skeleton className="hidden aspect-[4/3] w-full md:block md:h-[215px]" />
          <Skeleton className="hidden aspect-[4/3] w-full md:block md:h-[215px]" />
        </div>

        {/* Pricing widget */}
        <aside className="border border-accent bg-background py-6 text-center">
          <Skeleton className="mx-auto h-3 w-24" variant="text" />
          <Skeleton className="mx-auto mt-3 h-10 w-32" variant="text" />
          <Skeleton className="mx-auto mt-1 h-4 w-28" variant="text" />
          <Skeleton className="mx-auto my-5 h-px w-8" />
          <div className="space-y-2 px-6">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-full" variant="text" />
          </div>
          <div className="mt-6 space-y-2 px-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </aside>
      </div>

      {/* Body */}
      <div className="mx-auto mt-16 max-w-3xl space-y-16 px-6 pb-16 md:px-12">
        {/* About */}
        <section className="space-y-4">
          <Skeleton className="h-3 w-32" variant="text" />
          <Skeleton className="h-8 w-1/2" variant="text" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-11/12" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
            <Skeleton className="h-4 w-3/4" variant="text" />
          </div>
        </section>

        {/* Amenities */}
        <section className="border-y border-divider py-12 text-center">
          <Skeleton className="mx-auto h-3 w-24" variant="text" />
          <Skeleton className="mx-auto mt-4 h-8 w-32" variant="text" />
          <div className="mt-8 grid grid-cols-2 gap-y-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton
                key={`amenity-${i}`}
                className="mx-auto h-5 w-24"
                variant="text"
              />
            ))}
          </div>
        </section>

        {/* Access */}
        <section className="space-y-4">
          <Skeleton className="h-3 w-24" variant="text" />
          <Skeleton className="h-8 w-32" variant="text" />
          <Skeleton className="mt-6 h-5 w-1/2" variant="text" />
        </section>
      </div>
    </div>
  );
}
