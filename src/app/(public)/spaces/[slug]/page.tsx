import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { IconStar } from "@tabler/icons-react";

import { getSpaceBySlug } from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStats } from "@/shared/domain/reviews/public-queries";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { getBaseUrl } from "@/shared/lib/constants";
import { parseStringArray } from "@/shared/lib/json-validators";
import {
  BreadcrumbJsonLd,
  ProductJsonLd,
} from "../../_shared/components/seo/json-ld";
import { Container } from "../../_shared/components/design-system/container";
import { SiteCTA } from "../../_shared/components/layouts/site-cta";
import { Breadcrumb } from "../../_shared/components/layouts/breadcrumb";
import { SpaceInfo } from "./_components/space-info";
import { ReservationWidget } from "./_components/reservation-widget";
import { RelatedSpaces } from "./_components/related-spaces";
import { SpaceReviews } from "./_components/space-reviews";

interface SpaceDetailPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: SpaceDetailPageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);
  if (!space) return {};

  return {
    title: space.ogpTitle ?? space.name,
    description:
      space.ogpDescription ??
      space.metaDescription ??
      space.descriptionPlainText ??
      undefined,
    openGraph: {
      title: space.ogpTitle ?? space.name,
      description:
        space.ogpDescription ?? space.descriptionPlainText ?? undefined,
      images: space.ogpImageUrl ?? space.mainImageUrl ?? undefined,
    },
  };
}

export default async function SpaceDetailPage({
  params,
}: SpaceDetailPageProps) {
  await connection();
  await requireFeatureEnabled("spaces");
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);
  if (!space) notFound();

  const reviewStats = space.reviewsEnabled
    ? await getSpaceReviewStats(space.id)
    : { averageRating: 0, totalCount: 0 };
  const baseUrl = getBaseUrl();
  const spaceUrl = `${baseUrl}/spaces/${slug}`;
  const subImages = parseStringArray(space.imageUrls);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "スペース一覧", url: "/spaces" },
          { name: space.name, url: spaceUrl },
        ]}
      />
      <ProductJsonLd
        name={space.name}
        description={space.descriptionPlainText || space.name}
        image={space.mainImageUrl ?? `${baseUrl}/og-image.png`}
        url={spaceUrl}
        offers={{
          price: space.hourlyPrice,
          priceCurrency: "JPY",
        }}
        {...(reviewStats.totalCount > 0 && {
          aggregateRating: {
            ratingValue: reviewStats.averageRating,
            reviewCount: reviewStats.totalCount,
          },
        })}
      />

      {/* Breadcrumb 帯 */}
      <div className="bg-surface py-2 shadow-inner">
        <Container>
          <Breadcrumb
            items={[
              { label: "スペース一覧", href: "/spaces" },
              { label: space.name },
            ]}
            size="sm"
          />
        </Container>
      </div>

      <article className="mx-auto max-w-[var(--container-max)] px-6 pt-12 md:px-12 md:pt-16">
        {/* Hero header: Kinfolk magazine cover pattern (中央寄せ eyebrow + serif h1 + meta) */}
        <header className="text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — Space —
          </p>
          <h1 className="mt-5 font-heading text-4xl font-light leading-tight tracking-tight md:text-5xl">
            {space.name}
          </h1>
          <hr
            aria-hidden="true"
            className="mx-auto mt-6 w-12 border-0 border-t border-accent"
          />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {reviewStats.totalCount > 0 ? (
              <>
                <span className="flex items-center gap-1.5">
                  <IconStar
                    className="h-3.5 w-3.5 fill-accent text-accent"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">
                    {reviewStats.averageRating.toFixed(1)}
                  </span>
                  ({reviewStats.totalCount})
                </span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {space.category ? (
              <>
                <span>{space.category.name}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {space.location ? (
              <>
                <span>{space.location.name}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span>{space.capacity}名</span>
            {space.area ? (
              <>
                <span aria-hidden="true">/</span>
                <span>{Number(space.area)}㎡</span>
              </>
            ) : null}
          </div>
        </header>

        {/* 2-col: 左カラム (gallery + body) / 右カラム (sticky widget) — widget は本文全体を追従 */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          {/* Left column */}
          <div className="min-w-0 space-y-16">
            {/* Gallery mosaic */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-2">
              <div className="relative aspect-[4/3] overflow-hidden md:col-span-2 md:row-span-2 md:aspect-auto md:h-[440px]">
                <Image
                  src={space.mainImageUrl}
                  alt={space.name}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
              {subImages.slice(0, 2).map((img) => (
                <div
                  key={img}
                  className="relative hidden aspect-[4/3] overflow-hidden md:block md:h-[215px]"
                >
                  <Image
                    src={img}
                    alt={`${space.name} の写真`}
                    fill
                    sizes="(min-width: 1024px) 17vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>

            {/* Body */}
            <SpaceInfo space={space} />

            {space.reviewsEnabled ? (
              <Suspense fallback={null}>
                <SpaceReviews spaceId={space.id} />
              </Suspense>
            ) : null}
          </div>

          {/* Sticky pricing widget — 本文全体を追従 */}
          <aside className="lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
            <ReservationWidget
              spaceId={space.id}
              spaceName={space.name}
              hourlyPrice={Number(space.hourlyPrice)}
              dailyPrice={space.dailyPrice ? Number(space.dailyPrice) : null}
            />
          </aside>
        </div>
      </article>

      <div className="pb-16" />

      <Suspense fallback={null}>
        <RelatedSpaces
          currentId={space.id}
          categoryId={space.category?.id ?? null}
        />
      </Suspense>
      <SiteCTA />
    </>
  );
}
