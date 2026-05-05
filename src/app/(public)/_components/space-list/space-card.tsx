import Link from "next/link";
import { IconMapPin, IconStar } from "@tabler/icons-react";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { formatUnitPriceWithTax } from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";
import { ImageCarousel } from "./image-carousel";

interface SpaceCardProps {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly mainImageUrl: string;
  readonly imageUrls?: readonly string[] | undefined;
  readonly categoryName?: string | null | undefined;
  readonly locationName?: string | undefined;
  readonly averageRating?: number | undefined;
  readonly reviewCount?: number | undefined;
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
  imageUrls,
  categoryName,
  locationName,
  averageRating,
  reviewCount,
}: SpaceCardProps) {
  // imageUrls はスキーマで重複禁止が保証されている（mainImageUrl との重複も禁止）
  const allImages = imageUrls ? [mainImageUrl, ...imageUrls] : [mainImageUrl];

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
          />
        ) : (
          <ImageFrame
            src={mainImageUrl}
            alt={name}
            fill
            aspect="photo"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          />
        )}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5">
        {categoryName ? (
          <p className="text-[0.625rem] uppercase tracking-[0.18em] text-accent">
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
            <span className="font-medium text-rating">
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
