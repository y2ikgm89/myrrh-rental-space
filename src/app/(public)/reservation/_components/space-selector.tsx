"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { Info } from "lucide-react";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { SpaceDetailDialog } from "./space-detail-dialog";

const YEN = "\u00A5";

export function SpaceSelector({
  spaces,
  selectedId,
  onSelect,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const isSingle = spaces.length === 1;
  const [detailSpace, setDetailSpace] = useState<SpaceOption | null>(null);

  return (
    <>
      <div
        role="radiogroup"
        aria-label="スペースを選択"
        className={
          spaces.length <= 3
            ? "grid gap-4 md:grid-cols-3"
            : "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:overflow-visible md:snap-none md:pb-0"
        }
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
              className={`flex min-w-[75vw] snap-start flex-col overflow-hidden rounded-xl border text-left transition-all
                ${
                  isSelected
                    ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                    : "border-border bg-card hover:border-accent/40"
                }
                ${isSingle ? "cursor-default" : "cursor-pointer"}
                md:min-w-0`}
            >
              <ImageFrame
                src={space.mainImageUrl}
                alt={space.name}
                width={400}
                height={300}
                sizes="(max-width: 768px) 75vw, 280px"
                className="aspect-[4/3] w-full"
              />
              <div className="p-3">
                <span className="font-heading text-sm font-medium tracking-tight">
                  {space.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  定員{space.capacity}名
                  {space.area != null ? ` / ${String(space.area)}㎡` : ""}
                </span>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-heading text-sm text-accent">
                    {YEN}
                    {space.hourlyPrice.toLocaleString()}/h
                  </span>
                  <button
                    type="button"
                    aria-label={`${space.name}の詳細を見る`}
                    className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailSpace(space);
                    }}
                  >
                    <Info className="h-3 w-3" />
                    詳細を見る
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
