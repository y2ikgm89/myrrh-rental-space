"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { IconInfoCircle } from "@tabler/icons-react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { SpaceDetailDialog } from "./space-detail-dialog";
import { useFormatPrice } from "@/public/hooks/use-format-price";

/**
 * 公開予約ページ Step 1 スペース選択。
 *
 * Variant G (Step Wizard Improved) 準拠 — 横長カード (画像左 + テキスト右) ×
 * 3 列 grid (Container Queries) で 1 画面密度を最大化。
 * 旧 縦長カード + horizontal snap-scroll パターンは廃止。
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
        className="@container grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3"
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
                "grid grid-cols-[110px_1fr] gap-3 border p-2 text-left transition-colors duration-200",
                isSelected
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-foreground/30",
                isSingle ? "cursor-default" : "cursor-pointer",
              )}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
                <Image
                  src={space.mainImageUrl}
                  alt={space.name}
                  fill
                  sizes="110px"
                  className="object-cover transition-opacity duration-400 hover:opacity-85"
                />
              </div>
              <div className="flex min-h-[110px] flex-col justify-between py-1">
                <div className="min-w-0">
                  <p className="truncate font-heading text-sm font-light tracking-tight">
                    {space.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    定員{space.capacity}名
                    {space.area != null ? ` / ${String(space.area)}㎡` : ""}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-light text-accent">
                    {formatUnit(space.hourlyPrice, "/h")}
                  </span>
                  <button
                    type="button"
                    aria-label={`${space.name}の詳細を見る`}
                    className="inline-flex shrink-0 items-center gap-1 border border-border px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailSpace(space);
                    }}
                  >
                    <IconInfoCircle className="h-3 w-3" />
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
