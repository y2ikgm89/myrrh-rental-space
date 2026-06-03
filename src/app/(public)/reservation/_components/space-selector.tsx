"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { IconInfoCircle } from "@tabler/icons-react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { SpaceDetailDialog } from "./space-detail-dialog";
import { useFormatPrice } from "@/public/hooks/use-format-price";

/** Desktop card に表示する設備 icon 最大件数。超過分は "+N" badge で示す。 */
const MAX_FACILITY_ICONS = 6;

/**
 * 公開予約ページ Step 1 スペース選択。
 *
 * Responsive ハイブリッドカード (Container Queries):
 * - mobile: 縦長 1 列 + aspect 16:9 全幅 (Spacemarket / Airbnb / インスタベース系) で
 *   写真主役、雰囲気重視。1 件約 280px 高、1 画面 2 件。
 * - @md (tablet+): 横長 1 列 + 画像 260px (aspect 4:3) (Booking.com / 楽天トラベル系) で
 *   比較容易性優先、1 行に名前・定員・面積・価格・詳細を並列表示。
 * - @3xl (desktop wide): 画像 320px に拡大しゆとり確保。
 */
export function SpaceSelector({
  spaces,
  selectedId,
  onSelect,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const { formatUnit } = useFormatPrice();
  const isSingle = spaces.length === 1;
  const [detailSpace, setDetailSpace] = useState<SpaceOption | null>(null);

  return (
    <>
      <div
        role="radiogroup"
        aria-label="スペースを選択"
        className="@container flex flex-col gap-3"
      >
        {spaces.map((space) => {
          const isSelected = space.id === selectedId;
          return (
            <div
              key={space.id}
              role="radio"
              tabIndex={isSingle ? -1 : 0}
              aria-checked={isSelected}
              onClick={() => onSelect(space.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(space.id);
                }
              }}
              className={cn(
                "group flex flex-col overflow-hidden border text-left transition-colors duration-200",
                "@md:grid @md:grid-cols-[260px_1fr] @md:gap-5 @md:p-4 @3xl:grid-cols-[320px_1fr]",
                isSelected
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-foreground/30",
                isSingle ? "cursor-default" : "cursor-pointer",
              )}
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface @md:aspect-[4/3]">
                <Image
                  src={space.mainImageUrl}
                  alt={space.name}
                  fill
                  sizes="(min-width: 120rem) 320px, (min-width: 48rem) 260px, 100vw"
                  className="object-cover transition-opacity duration-400 group-hover:opacity-85"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2 p-4 @md:gap-3 @md:p-0 @md:py-1">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-light tracking-tight @md:text-xl">
                    {space.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    定員{space.capacity}名
                    {space.area != null ? ` / ${String(space.area)}㎡` : ""}
                  </p>
                  {space.descriptionPlainText.length > 0 ? (
                    <p className="mt-2 hidden text-sm leading-relaxed text-muted-foreground @md:line-clamp-2 @md:block">
                      {space.descriptionPlainText}
                    </p>
                  ) : null}
                  {space.facilities.length > 0 ? (
                    <ul
                      aria-label="主要な設備"
                      className="mt-3 hidden flex-wrap items-center gap-1.5 @md:flex"
                    >
                      {space.facilities
                        .slice(0, MAX_FACILITY_ICONS)
                        .map((facility) => (
                          <li
                            key={facility.name}
                            aria-label={facility.name}
                            title={facility.name}
                            className="inline-flex h-7 w-7 items-center justify-center border border-border text-muted-foreground"
                          >
                            <CuratedIcon
                              name={facility.iconName}
                              className="h-4 w-4"
                            />
                          </li>
                        ))}
                      {space.facilities.length > MAX_FACILITY_ICONS ? (
                        <li
                          aria-label={`他 ${space.facilities.length - MAX_FACILITY_ICONS} 件の設備`}
                          className="inline-flex h-7 items-center px-2 text-xs text-muted-foreground"
                        >
                          +{space.facilities.length - MAX_FACILITY_ICONS}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-2 @md:mt-auto">
                  <span className="text-lg font-light text-accent @md:text-xl">
                    {formatUnit(space.hourlyPrice, "/h")}
                  </span>
                  <button
                    type="button"
                    aria-label={`${space.name}の詳細を見る`}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground @md:text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailSpace(space);
                    }}
                  >
                    <IconInfoCircle className="h-4 w-4" />
                    詳細
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <SpaceDetailDialog
        space={detailSpace}
        onOpenChange={(open) => {
          if (!open) setDetailSpace(null);
        }}
        onSelect={onSelect}
        isSelected={detailSpace?.id === selectedId}
      />
    </>
  );
}
