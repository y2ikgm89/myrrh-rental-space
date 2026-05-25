import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import { getSpaceBySlug } from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStats } from "@/shared/domain/reviews/public-queries";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { getBaseUrl } from "@/shared/lib/constants";
import { ProductJsonLd } from "../../_shared/components/seo/json-ld";
import { ArticleLayout } from "../../_shared/components/layouts/article-layout";
import { SiteCTA } from "../../_shared/components/layouts/site-cta";
import { SpaceArticleHeader } from "./_components/space-article-header";
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

  const reservationWidget = (
    <ReservationWidget
      spaceId={space.id}
      spaceName={space.name}
      hourlyPrice={Number(space.hourlyPrice)}
      dailyPrice={space.dailyPrice ? Number(space.dailyPrice) : null}
    />
  );

  return (
    <>
      <ArticleLayout
        jsonLd={
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
        }
        breadcrumb={[
          { label: "スペース一覧", href: "/spaces" },
          { label: space.name },
        ]}
        toc={reservationWidget}
        mobileToc={reservationWidget}
        showCta={false}
      >
        <SpaceArticleHeader
          title={space.name}
          mainImage={space.mainImageUrl}
          images={space.imageUrls}
        />

        <SpaceInfo space={space} />

        {space.reviewsEnabled ? (
          <section className="mt-16">
            <Suspense fallback={null}>
              <SpaceReviews spaceId={space.id} />
            </Suspense>
          </section>
        ) : null}
      </ArticleLayout>

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
