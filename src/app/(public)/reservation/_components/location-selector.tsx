"use client";

import type { ReactElement } from "react";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";

/**
 * 公開予約ページ Step 1 場所選択。
 *
 * SpaceSelector と同型の Responsive ハイブリッドカード:
 * mobile = 縦長 aspect 16:9 / @md+ = 横長 aspect 4:3 + 画像 260/320px。
 * Step 1-2 でカード言語を完全統一する。
 */
export function LocationSelector({
  locations,
  selectedId,
  onSelect,
}: {
  readonly locations: readonly LocationWithSpaces[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="場所を選択"
      className="@container flex flex-col gap-3"
    >
      {locations.map((location) => {
        const isSelected = location.id === selectedId;
        return (
          <button
            key={location.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(location.id)}
            className={cn(
              "group flex flex-col overflow-hidden border text-left transition-colors duration-200",
              "@md:grid @md:grid-cols-[260px_1fr] @md:gap-5 @md:p-4 @3xl:grid-cols-[320px_1fr]",
              isSelected
                ? "border-accent bg-accent/5"
                : "border-border hover:border-foreground/30",
            )}
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface @md:aspect-[4/3]">
              <Image
                src={location.imageUrl}
                alt={location.name}
                fill
                sizes="(min-width: 120rem) 320px, (min-width: 48rem) 260px, 100vw"
                className="object-cover transition-opacity duration-400 group-hover:opacity-85"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2 p-4 @md:gap-3 @md:p-0 @md:py-1">
              <div className="min-w-0">
                <p className="font-heading text-lg font-light tracking-tight @md:text-xl">
                  {location.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {location.address}
                </p>
                {location.description != null &&
                location.description.length > 0 ? (
                  <p className="mt-2 hidden text-sm leading-relaxed text-muted-foreground @md:line-clamp-2 @md:block">
                    {location.description}
                  </p>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground @md:mt-auto">
                {location.spaces.length} スペース
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
