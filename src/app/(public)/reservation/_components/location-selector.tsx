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
            className={`flex gap-4 rounded-xl border p-3 text-left transition-all
              ${
                isSelected
                  ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                  : "border-border bg-card hover:border-accent/40"
              }`}
          >
            <ImageFrame
              src={location.imageUrl}
              alt={location.name}
              width={160}
              height={90}
              aspect="video"
              sizes="160px"
              className="w-40 shrink-0"
            />
            <div className="flex min-w-0 flex-col justify-center">
              <span className="font-heading text-base font-medium tracking-tight">
                {location.name}
              </span>
              <span className="mt-1 truncate text-sm text-muted-foreground">
                {location.address}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
