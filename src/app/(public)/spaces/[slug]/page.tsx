import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  IconStar,
  IconUsers,
  IconRuler2,
  IconMapPin,
  IconCategory,
} from "@tabler/icons-react";

import { getSpaceBySlug } from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStats } from "@/shared/domain/reviews/public-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";
import {
  getBlockedDateRangesForSpace,
  getBusinessHoursSettingsQuery,
} from "@/shared/domain/reservations/availability";
import { CANCELLATION_POLICY_TERMS_TYPE } from "@/shared/lib/validations/terms";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import {
  BreadcrumbJsonLd,
  ProductJsonLd,
} from "../../_shared/components/seo/json-ld";
import { Container } from "../../_shared/components/design-system/container";
import { SiteCTA } from "../../_shared/components/layouts/site-cta";
import { Breadcrumb } from "../../_shared/components/layouts/breadcrumb";
import { GalleryGrid } from "@/shared/components/gallery/GalleryGrid";
import { SpaceInfo } from "./_components/space-info";
import { ReservationWidget } from "./_components/reservation-widget";
import { RelatedSpaces } from "./_components/related-spaces";
import { SpaceReviews } from "./_components/space-reviews";
import { MobileReserveCTA } from "./_components/mobile-reserve-cta";
import { SpaceAvailabilityCalendar } from "./_components/space-availability-calendar";
import { AccessMap } from "@/app/(public)/_components/access-map";
import { ShareButtons } from "@/app/(public)/_shared/components/ui/share-buttons";

interface SpaceDetailPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: SpaceDetailPageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const [space, settings] = await Promise.all([
    getSpaceBySlug(slug),
    getSeoSettings(),
  ]);
  if (!space) return {};

  return generateArticleMetadata(
    {
      title: space.name,
      description:
        space.metaDescription ?? space.descriptionPlainText ?? undefined,
      image: space.ogpImageUrl ?? space.mainImageUrl,
      ogpTitle: space.ogpTitle,
      ogpDescription: space.ogpDescription ?? space.descriptionPlainText,
    },
    settings,
    {
      canonicalUrl: `${getBaseUrl()}/spaces/${slug}`,
      ogType: "website",
    },
  );
}

export default async function SpaceDetailPage({
  params,
}: SpaceDetailPageProps) {
  await connection();
  await requireFeatureEnabled("spaces");
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);
  if (!space) notFound();

  const [
    reviewStats,
    deadlineSettings,
    cancellationPolicy,
    businessHours,
    blockedRanges,
  ] = await Promise.all([
    space.reviewsEnabled
      ? getSpaceReviewStats(space.id)
      : Promise.resolve({ averageRating: 0, totalCount: 0 }),
    getReservationDeadlineSettings(),
    getPublishedTermsByType(CANCELLATION_POLICY_TERMS_TYPE),
    getBusinessHoursSettingsQuery(),
    getBlockedDateRangesForSpace(space.id),
  ]);
  const cancellationPolicyUrl = cancellationPolicy
    ? `/terms/${cancellationPolicy.slug}`
    : undefined;
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
        description={space.descriptionPlainText || space.name}
        image={space.mainImageUrl}
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

      <article className="mx-auto max-w-[var(--container-site)] px-6 pt-12 md:px-12 md:pt-16">
        {/* Hero header: Kinfolk magazine cover pattern (中央寄せ eyebrow + serif h1 + meta) */}
        <header className="text-center">
          <p className="text-xs uppercase tracking-eyebrow-wide text-accent">
            — Space —
          </p>
          <h1 className="mt-5 font-heading text-4xl font-light leading-tight tracking-tight md:text-5xl">
            {space.name}
          </h1>
          <hr
            aria-hidden="true"
            className="mx-auto mt-6 w-12 border-0 border-t border-accent"
          />
        </header>

        {/* 2-col: 左カラム (gallery + body) / 右カラム (sticky widget) — widget は本文全体を追従 */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          {/* Left column */}
          <div className="min-w-0 space-y-16">
            {/* Gallery: GalleryGrid が 0/1/2+ 件を内包処理。hero は先頭に仮想挿入 */}
            <GalleryGrid
              items={space.gallery}
              hero={space.mainImageUrl}
              priorityFirstImage
            />

            {/* Quick stats row (Airbnb / Vrbo pattern): gallery 直下 icon + label + value 4-col grid */}
            <section
              aria-label="スペースの概要"
              className="border-y border-divider py-6"
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
                {reviewStats.totalCount > 0 ? (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-eyebrow text-muted-foreground">
                      <IconStar
                        className="h-3.5 w-3.5 fill-accent text-accent"
                        aria-hidden="true"
                      />
                      評価
                    </dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums text-foreground">
                      {reviewStats.averageRating.toFixed(1)}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({reviewStats.totalCount})
                      </span>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="flex items-center gap-1.5 text-xs uppercase tracking-eyebrow text-muted-foreground">
                    <IconUsers className="h-3.5 w-3.5" aria-hidden="true" />
                    収容人数
                  </dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums text-foreground">
                    {space.capacity}名
                  </dd>
                </div>
                {space.area ? (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-eyebrow text-muted-foreground">
                      <IconRuler2 className="h-3.5 w-3.5" aria-hidden="true" />
                      広さ
                    </dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums text-foreground">
                      {Number(space.area)}㎡
                    </dd>
                  </div>
                ) : null}
                {space.location ? (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-eyebrow text-muted-foreground">
                      <IconMapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      所在地
                    </dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums text-foreground">
                      {space.location.name}
                    </dd>
                  </div>
                ) : null}
                {space.category ? (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-eyebrow text-muted-foreground">
                      <IconCategory
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      カテゴリ
                    </dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums text-foreground">
                      {space.category.name}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {/* Body */}
            <SpaceInfo space={space} />

            {/* 空き状況ミニカレンダー: 定休/休業/過去日を grey-out */}
            <SpaceAvailabilityCalendar
              spaceId={space.id}
              businessHours={businessHours}
              blockedRanges={blockedRanges}
            />

            {/* Access map — Google Maps Embed API (server component, DB API key) */}
            <section
              id="space-access"
              aria-labelledby="space-access-heading"
              className="space-y-4"
            >
              <div>
                <p className="text-xs uppercase tracking-eyebrow-wide text-accent">
                  — Access —
                </p>
                <h2
                  id="space-access-heading"
                  className="mt-2 text-lg font-medium text-foreground"
                >
                  アクセス
                </h2>
                {space.location.address && (
                  <p className="mt-2 text-sm text-foreground">
                    {space.lineAddress || space.location.address}
                  </p>
                )}
              </div>
              <Suspense fallback={null}>
                <AccessMap
                  address={space.location.address}
                  latitude={space.location.latitude}
                  longitude={space.location.longitude}
                  title={`Google Maps - ${space.name}のアクセスマップ`}
                />
              </Suspense>
            </section>

            {space.reviewsEnabled ? (
              <Suspense fallback={null}>
                <SpaceReviews spaceId={space.id} />
              </Suspense>
            ) : null}

            {/* Share row — Kinfolk hairline + brand icon cluster */}
            <div className="pt-4">
              <ShareButtons url={spaceUrl} title={space.name} />
            </div>
          </div>

          {/* Sticky pricing widget — 本文全体を追従 */}
          <aside className="lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
            <ReservationWidget
              spaceId={space.id}
              spaceName={space.name}
              hourlyPrice={Number(space.hourlyPrice)}
              dailyPrice={space.dailyPrice ? Number(space.dailyPrice) : null}
              cancellationDeadlineHours={
                deadlineSettings.cancellationDeadlineHours
              }
              cancellationPolicyUrl={cancellationPolicyUrl}
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

      <MobileReserveCTA
        spaceId={space.id}
        hourlyPrice={Number(space.hourlyPrice)}
      />
    </>
  );
}
