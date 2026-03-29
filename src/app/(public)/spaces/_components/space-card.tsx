"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  IconMapPin,
  IconUsers,
  IconRuler2,
  IconStar,
} from "@tabler/icons-react";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import { useFormatPrice } from "@/public/hooks/use-format-price";

interface SpaceCardProps {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly mainImageUrl: string;
  readonly categoryName?: string | null | undefined;
  // Hover preview data (optional — overlay only renders when provided)
  readonly locationName?: string | undefined;
  readonly lineAddress?: string | undefined;
  readonly facilities?: readonly string[] | undefined;
  readonly dailyPrice?: number | null | undefined;
  // Review stats (optional — only renders when totalCount > 0)
  readonly averageRating?: number | undefined;
  readonly reviewCount?: number | undefined;
}

export function SpaceCard({
  slug,
  name,
  description,
  capacity,
  area,
  hourlyPrice,
  mainImageUrl,
  categoryName,
  locationName,
  lineAddress,
  facilities,
  dailyPrice,
  averageRating,
  reviewCount,
}: SpaceCardProps) {
  const { formatUnit } = useFormatPrice();
  const hasHoverData = locationName !== undefined && lineAddress !== undefined;
  const [showOverlay, setShowOverlay] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (!hasHoverData || e.pointerType !== "mouse") return;
    timerRef.current = setTimeout(() => setShowOverlay(true), 500);
  };

  const handlePointerLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowOverlay(false);
  };

  return (
    <Link
      href={`/spaces/${slug}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={() => {
        if (hasHoverData) setShowOverlay(true);
      }}
      onBlur={() => setShowOverlay(false)}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={mainImageUrl}
          alt={name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Hover Preview Overlay */}
        {hasHoverData ? (
          <div
            aria-hidden="true"
            className={`absolute inset-0 flex flex-col justify-end bg-overlay p-4 backdrop-blur-sm transition-opacity duration-300 motion-reduce:duration-0 ${
              showOverlay ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="space-y-2 text-sm text-overlay-foreground">
              <div className="flex items-center gap-1.5">
                <IconMapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">{locationName}</span>
              </div>
              <p className="text-xs text-overlay-foreground/80">
                {lineAddress}
              </p>

              {facilities && facilities.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {facilities.slice(0, 4).map((f) => (
                    <span
                      key={f}
                      className="rounded bg-overlay-foreground/20 px-1.5 py-0.5 text-[11px]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}

              {hourlyPrice != null ? (
                <div className="pt-1 text-xs font-medium">
                  <span>{formatUnit(hourlyPrice, "/h")}</span>
                  {dailyPrice != null ? (
                    <span className="ml-2 text-overlay-foreground/80">
                      {formatUnit(dailyPrice, "/day")}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {categoryName ? (
          <div className="absolute left-3 top-3">
            <Badge>{categoryName}</Badge>
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="p-4 md:p-5">
        <Heading level={3} className="!text-base font-medium md:!text-lg">
          {name}
        </Heading>
        {description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
        {capacity != null || hourlyPrice != null ? (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              {capacity != null ? (
                <span className="flex items-center gap-1">
                  <IconUsers className="h-4 w-4" />
                  {capacity}名
                </span>
              ) : null}
              {area != null ? (
                <span className="flex items-center gap-1">
                  <IconRuler2 className="h-4 w-4" />
                  {area}㎡
                </span>
              ) : null}
            </div>
            {hourlyPrice != null ? (
              <span className="font-medium text-accent">
                {formatUnit(hourlyPrice, "/h")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
