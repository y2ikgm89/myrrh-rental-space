import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { IconRuler2, IconUsers } from "@tabler/icons-react";

import { getSpaceBySlug } from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStats } from "@/shared/domain/reviews/public-queries";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { getBaseUrl } from "@/shared/lib/constants";
import { ProductJsonLd } from "../../_shared/components/seo/json-ld";
import { ArticleLayout } from "../../_shared/components/layouts/article-layout";
import { ArticleHeader } from "../../_shared/components/layouts/article-header";
import { SiteCTA } from "../../_shared/components/layouts/site-cta";
import { Badge } from "../../_shared/components/design-system/badge";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
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

  const articleHero = (
    <ArticleHeader
      eyebrow="Space"
      title={space.name}
      meta={
        <>
          {space.category ? (
            <Badge>
              {space.category.icon ? (
                <CuratedIcon
                  name={space.category.icon}
                  className="mr-1 inline h-3 w-3"
                />
              ) : null}
              {space.category.name}
            </Badge>
          ) : null}
          {space.location ? (
            <Badge variant="info">{space.location.name}</Badge>
          ) : null}
          <span className="flex items-center gap-1">
            <IconUsers className="h-4 w-4" aria-hidden="true" />
            {space.capacity}名
          </span>
          {space.area ? (
            <span className="flex items-center gap-1">
              <IconRuler2 className="h-4 w-4" aria-hidden="true" />
              {Number(space.area)}㎡
            </span>
          ) : null}
        </>
      }
      media={
        <SpaceGallery
          mainImage={space.mainImageUrl}
          images={space.imageUrls}
          name={space.name}
        />
      }
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
        hero={articleHero}
        toc={reservationWidget}
        mobileToc={reservationWidget}
        showCta={false}
      >
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
