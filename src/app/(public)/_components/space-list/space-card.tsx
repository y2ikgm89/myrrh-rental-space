import Link from "next/link";
import { connection } from "next/server";
import { IconArrowRight, IconMapPin, IconStar } from "@tabler/icons-react";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { Badge } from "@/public/components/design-system/badge";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { formatUnitPriceWithTax } from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import type { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";
import { ImageCarousel } from "@/shared/components/media/ImageCarousel";
import type { GalleryItem } from "@/shared/lib/validations/gallery";
import { isImageUrl } from "@/shared/lib/media/detect-media-type";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface SpaceCardProps {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly taxRateType: TaxRateType;
  readonly mainImageUrl: string;
  readonly gallery?: readonly GalleryItem[] | undefined;
  readonly categoryName?: string | null | undefined;
  readonly locationName?: string | undefined;
  readonly averageRating?: number | undefined;
  readonly reviewCount?: number | undefined;
  /**
   * 空き時間帯 facet 検索時のみ渡される。false のときだけ「空きなし」バッジを
   * 出す（undefined = facet 未使用時は何も表示しない）。
   */
  readonly isAvailableForSearch?: boolean | undefined;
  readonly imagePriority?: boolean | undefined;
  /**
   * "grid"（default）: 画像上・テキスト下の縦カード。SpaceShowcase / 関連スペース等で使用。
   * "horizontal": 画像左・テキスト右の横長カード。/spaces 一覧の SpaceGrid で使用。
   */
  readonly layout?: "grid" | "horizontal";
  /**
   * aria-describedby 用 id の衝突回避キー。同一 slug のスペースが同一ページ内に
   * 複数回描画されうる呼び出し元（複製された space-showcase セクション等）でのみ
   * 指定する。async Server Component のため `useId()` は使えず slug ベースで
   * id を生成しているため、slug だけでは page 内一意性を保証できない。
   */
  readonly instanceId?: string | undefined;
}

/**
 * 公開スペースカード（async Server Component）
 *
 * 税表示モードは layout の `TaxSettingsProvider` が SSoT だが、Server Component から
 * Context は読めないため `getPublicTaxSettings()` を直接呼ぶ。`'use cache'` で
 * リクエスト単位に dedup されるため、グリッド内の複数カード描画でも DB 1 回。
 */
export async function SpaceCard({
  slug,
  name,
  description,
  capacity,
  area,
  hourlyPrice,
  taxRateType,
  mainImageUrl,
  gallery,
  categoryName,
  locationName,
  averageRating,
  reviewCount,
  isAvailableForSearch,
  imagePriority = false,
  layout = "grid",
  instanceId,
}: SpaceCardProps) {
  await connection();

  const idScope = instanceId ? `${instanceId}-${slug}` : slug;
  const imageLoading = imagePriority ? "eager" : "lazy";
  const imageFetchPriority = imagePriority ? "high" : "auto";
  const allImages = gallery
    ? [
        mainImageUrl,
        ...gallery.filter((g) => isImageUrl(g.url)).map((g) => g.url),
      ]
    : [mainImageUrl];

  const tax = await getPublicTaxSettings();
  const taxRate = getTaxRate(taxRateType, tax);
  const hourlyPriceLabel =
    hourlyPrice != null
      ? formatUnitPriceWithTax(
          hourlyPrice,
          taxRate,
          tax.displayModePublic,
          "/h",
        )
      : null;

  if (layout === "horizontal") {
    const metaGroupId = `space-card-meta-${idScope}`;
    const infoRowId = `space-card-info-${idScope}`;
    const priceId = `space-card-price-${idScope}`;

    return (
      <Link
        href={toAppRoute(`/spaces/${slug}`)}
        aria-label={
          isAvailableForSearch === false
            ? `${name}（指定の日時は空きがありません）`
            : name
        }
        className="group flex flex-col gap-4 py-6 md:flex-row md:items-start md:gap-8 md:py-10"
      >
        <ImageFrame
          src={mainImageUrl}
          alt={name}
          fill
          aspect="landscape"
          sizes="(min-width: 768px) 16rem, 100vw"
          loading={imageLoading}
          fetchPriority={imageFetchPriority}
          className="w-full shrink-0 md:w-64"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div>
            <div id={metaGroupId} className="flex flex-wrap items-center gap-2">
              {categoryName ? (
                <p className="text-xs uppercase tracking-eyebrow text-accent">
                  {categoryName}
                </p>
              ) : null}
              {isAvailableForSearch === false ? (
                <Badge variant="warning">指定の日時は空きがありません</Badge>
              ) : null}
            </div>
            <h3
              aria-describedby={`${metaGroupId} ${infoRowId} ${priceId}`}
              className="mt-1 font-heading text-lg font-light tracking-tight md:text-xl"
            >
              {name}
            </h3>
            {description ? (
              <p className="mt-2 hidden min-h-12 line-clamp-2 text-sm leading-relaxed text-muted-foreground md:block">
                {description}
              </p>
            ) : (
              <div
                className="mt-2 hidden min-h-12 md:block"
                aria-hidden="true"
              />
            )}
            <div
              id={infoRowId}
              className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:mt-3"
            >
              {locationName ? (
                <span className="flex items-center gap-1">
                  <IconMapPin
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {locationName}
                </span>
              ) : null}
              {capacity != null ? <span>{capacity}名</span> : null}
              {area != null ? <span>{area}㎡</span> : null}
              {reviewCount != null &&
              reviewCount > 0 &&
              averageRating != null ? (
                <span className="flex items-center gap-0.5">
                  <IconStar
                    className="h-3.5 w-3.5 text-rating"
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-accent">
                    {averageRating.toFixed(1)}
                  </span>
                  <span>({reviewCount})</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3 md:mt-4">
            {hourlyPriceLabel ? (
              <p
                id={priceId}
                className="font-heading text-base text-accent md:text-lg"
              >
                {hourlyPriceLabel}
              </p>
            ) : (
              <span id={priceId} />
            )}
            <span className="flex items-center gap-1 text-xs uppercase tracking-eyebrow text-muted-foreground transition-colors group-hover:text-foreground">
              詳細
              <IconArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  const categoryId = `space-card-category-${idScope}`;
  const locationId = `space-card-location-${idScope}`;
  const ratingId = `space-card-rating-${idScope}`;
  const summaryId = `space-card-summary-${idScope}`;
  const describedBy = [
    categoryName ? categoryId : null,
    locationName ? locationId : null,
    reviewCount != null && reviewCount > 0 && averageRating != null
      ? ratingId
      : null,
    summaryId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      href={toAppRoute(`/spaces/${slug}`)}
      className="group block overflow-hidden border border-border"
    >
      {/* Image area */}
      <div className="relative">
        {allImages.length > 1 ? (
          <ImageCarousel
            images={allImages}
            alt={name}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            loading={imageLoading}
            fetchPriority={imageFetchPriority}
          />
        ) : (
          <ImageFrame
            src={mainImageUrl}
            alt={name}
            fill
            aspect="photo"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            loading={imageLoading}
            fetchPriority={imageFetchPriority}
          />
        )}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5">
        {categoryName ? (
          <p
            id={categoryId}
            className="text-xs uppercase tracking-eyebrow text-accent"
          >
            {categoryName}
          </p>
        ) : null}
        <h3
          aria-describedby={describedBy}
          className="mt-1 font-heading text-[1.25rem] font-light tracking-tight"
        >
          {name}
        </h3>
        {locationName ? (
          <p
            id={locationId}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <IconMapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{locationName}</span>
          </p>
        ) : null}
        {description ? (
          <p className="mt-2 line-clamp-2 text-[0.85rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {reviewCount != null && reviewCount > 0 && averageRating != null ? (
          <div id={ratingId} className="mt-2 flex items-center gap-1 text-sm">
            <IconStar
              className="h-3.5 w-3.5 text-rating"
              fill="currentColor"
              aria-hidden="true"
            />
            <span className="font-medium text-accent">
              {averageRating.toFixed(1)}
            </span>
            <span className="text-muted-foreground">({reviewCount}件)</span>
          </div>
        ) : null}
        <p id={summaryId} className="mt-2 text-[0.75rem] text-muted-foreground">
          {area != null ? `${area}m² · ` : ""}
          {capacity != null ? `Max ${capacity}` : ""}
          {hourlyPriceLabel ? (
            <>
              {(area != null || capacity != null) && " · "}
              <span className="font-heading text-[0.95rem] text-accent">
                {hourlyPriceLabel}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
