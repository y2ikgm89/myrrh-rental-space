"use client";

import type { ReactElement } from "react";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
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
      className="grid gap-4 md:grid-cols-2"
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
            className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all
              ${
                isSelected
                  ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                  : "border-border bg-card hover:border-accent/40 hover:shadow-lg"
              }`}
          >
            <ImageFrame
              src={location.imageUrl}
              alt={location.name}
              width={400}
              height={225}
              sizes="(max-width: 768px) 100vw, 400px"
              className="aspect-video w-full transition-transform duration-500 group-hover:scale-105"
            />
            <div className="p-4">
              <span className="font-heading text-base font-medium tracking-tight">
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
