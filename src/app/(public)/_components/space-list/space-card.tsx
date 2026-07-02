import Link from "next/link";
import { connection } from "next/server";
import { IconArrowRight, IconMapPin, IconStar } from "@tabler/icons-react";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { formatUnitPriceWithTax } from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";
import { ImageCarousel } from "@/shared/components/media/ImageCarousel";
import type { GalleryItem } from "@/shared/lib/validations/gallery";
import { isImageUrl } from "@/shared/lib/media/detect-media-type";

interface SpaceCardProps {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly mainImageUrl: string;
  readonly gallery?: readonly GalleryItem[] | undefined;
  readonly categoryName?: string | null | undefined;
  readonly locationName?: string | undefined;
  readonly averageRating?: number | undefined;
  readonly reviewCount?: number | undefined;
  readonly imagePriority?: boolean | undefined;
  /**
   * "grid"（default）: 画像上・テキスト下の縦カード。SpaceShowcase / 関連スペース等で使用。
   * "horizontal": 画像左・テキスト右の横長カード。/spaces 一覧の SpaceGrid で使用。
   */
  readonly layout?: "grid" | "horizontal";
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
  mainImageUrl,
  gallery,
  categoryName,
  locationName,
  averageRating,
  reviewCount,
  imagePriority = false,
  layout = "grid",
}: SpaceCardProps) {
  await connection();

  const imageLoading = imagePriority ? "eager" : "lazy";
  const imageFetchPriority = imagePriority ? "high" : "auto";
  const allImages = gallery
    ? [
        mainImageUrl,
        ...gallery.filter((g) => isImageUrl(g.url)).map((g) => g.url),
      ]
    : [mainImageUrl];

  const tax = await getPublicTaxSettings();
  const taxRate = getTaxRate(TaxRateType.standard, tax);
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
    return (
      <Link
        href={`/spaces/${slug}`}
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
            {categoryName ? (
              <p className="text-xs uppercase tracking-eyebrow text-accent">
                {categoryName}
              </p>
            ) : null}
            <h3 className="mt-1 font-heading text-lg font-light tracking-tight md:text-xl">
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
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:mt-3">
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
              <p className="font-heading text-base text-accent md:text-lg">
                {hourlyPriceLabel}
              </p>
            ) : (
              <span />
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

  return (
    <Link
      href={`/spaces/${slug}`}
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
          <p className="text-xs uppercase tracking-eyebrow text-accent">
            {categoryName}
          </p>
        ) : null}
        <h3 className="mt-1 font-heading text-[1.25rem] font-light tracking-tight">
          {name}
        </h3>
        {locationName ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
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
          <div className="mt-2 flex items-center gap-1 text-sm">
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
        <p className="mt-2 text-[0.75rem] text-muted-foreground">
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
