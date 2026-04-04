"use client";

import type { ReactElement } from "react";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import { cn } from "@/shared/lib/cn";
import { ImageFrame } from "@/public/components/design-system/image-frame";

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
      className="grid grid-cols-1 gap-6 md:grid-cols-2"
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
              isSelected
                ? "border-accent bg-accent/5"
                : "border-border hover:border-foreground/30",
            )}
          >
            <ImageFrame
              src={location.imageUrl}
              alt={location.name}
              width={400}
              height={225}
              sizes="(max-width: 768px) 100vw, 400px"
              rounded={false}
              className="aspect-video w-full transition-opacity duration-400 group-hover:opacity-85"
            />
            <div className="p-4">
              <span className="font-heading text-base font-light tracking-tight">
                {location.name}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {location.address}
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                {location.spaces.length}
                {location.spaces.length === 1 ? " スペース" : " スペース"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
