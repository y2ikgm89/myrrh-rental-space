"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import { IconUsers, IconRuler2 } from "@tabler/icons-react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { Button } from "@/public/components/design-system/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/public/components/design-system/dialog";
import { useFormatPrice } from "@/public/hooks/use-format-price";

export function SpaceDetailDialog({
  space,
  onOpenChange,
  onSelect,
  isSelected,
}: {
  readonly space: SpaceOption | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (id: string) => void;
  readonly isSelected: boolean;
}): ReactElement {
  const { formatUnit } = useFormatPrice();
  const allImages =
    space !== null
      ? [space.mainImageUrl, ...space.imageUrls].filter(Boolean)
      : [];

  return (
    <Dialog open={space !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {space !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{space.name}</DialogTitle>
              {space.description.length > 0 ? (
                <DialogDescription>{space.description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">
                  スペースの詳細情報
                </DialogDescription>
              )}
            </DialogHeader>

            {/* Image Gallery */}
            {allImages.length === 1 ? (
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={allImages[0] ?? ""}
                  alt={space.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 448px"
                  className="object-cover"
                />
              </div>
            ) : allImages.length > 1 ? (
              <div
                aria-label={`${space.name}の写真`}
                className="-mx-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-6 pb-2"
              >
                {allImages.map((url, i) => (
                  <div
                    key={url}
                    className="relative aspect-[4/3] w-[80%] shrink-0 snap-start overflow-hidden sm:w-[60%]"
                  >
                    <Image
                      src={url}
                      alt={`${space.name} ${String(i + 1)}`}
                      fill
                      sizes="300px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Metadata */}
            <div className="space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <IconUsers className="h-4 w-4 shrink-0" />
                <span>定員{space.capacity}名</span>
              </div>
              {space.area != null ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <IconRuler2 className="h-4 w-4 shrink-0" />
                  <span>{space.area}㎡</span>
                </div>
              ) : null}
              <div className="font-heading text-base text-accent">
                {formatUnit(space.hourlyPrice, "/h")}
                {space.dailyPrice != null ? (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {formatUnit(space.dailyPrice, "/day")}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Facilities */}
            {space.facilities.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-4">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  設備
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {space.facilities.map((f) => (
                    <span
                      key={f}
                      className="border border-border px-2 py-1 text-xs text-muted-foreground"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Select Button */}
            <div className="border-t border-border pt-4">
              <Button
                variant="primary"
                className="w-full"
                disabled={isSelected}
                onClick={() => {
                  onSelect(space.id);
                  onOpenChange(false);
                }}
              >
                {isSelected ? "選択中" : "このスペースを選択"}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
