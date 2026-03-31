import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import { getSpaceBySlug } from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStats } from "@/shared/domain/reviews/public-queries";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  ProductJsonLd,
  BreadcrumbJsonLd,
} from "../../_shared/components/seo/json-ld";
import { PageHero } from "../../_shared/components/layouts/page-hero";
import { Breadcrumb } from "../../_shared/components/layouts/breadcrumb";
import { SiteCTA } from "../../_shared/components/layouts/site-cta";
import { Container } from "../../_shared/components/design-system/container";
import { SpaceGallery } from "./_components/space-gallery";
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
      space.description ??
      undefined,
    openGraph: {
      title: space.ogpTitle ?? space.name,
      description: space.ogpDescription ?? space.description ?? undefined,
      images: space.ogpImageUrl ?? space.mainImageUrl ?? undefined,
    },
  };
}

export default async function SpaceDetailPage({
  params,
}: SpaceDetailPageProps) {
  await connection();
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);
  if (!space) notFound();

  const reviewStats = await getSpaceReviewStats(space.id);
  const baseUrl = getBaseUrl();
  const spaceUrl = `${baseUrl}/spaces/${slug}`;

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
        description={space.description ?? space.name}
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
      <PageHero
        variant="compact"
        title={space.name}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "スペース一覧", href: "/spaces" },
              { label: space.name },
            ]}
          />
        }
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          <SpaceGallery
            mainImage={space.mainImageUrl}
            images={space.imageUrls}
            name={space.name}
          />

          <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_380px]">
            <div>
              <SpaceInfo space={space} />
              <Suspense fallback={null}>
                <SpaceReviews spaceId={space.id} />
              </Suspense>
            </div>
            <div className="lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:self-start">
              <ReservationWidget
                spaceName={space.name}
                hourlyPrice={Number(space.hourlyPrice)}
                dailyPrice={space.dailyPrice ? Number(space.dailyPrice) : null}
              />
            </div>
          </div>
        </Container>
      </section>

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
