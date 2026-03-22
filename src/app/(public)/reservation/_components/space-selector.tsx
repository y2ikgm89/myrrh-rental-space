"use client";

import type { ReactElement } from "react";

export type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string | null;
};

export function SpaceSelector({
  spaces,
  selectedId,
  onSelect,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const isSingle = spaces.length === 1;

  return (
    <div
      role="radiogroup"
      aria-label="スペースを選択"
      className={
        spaces.length <= 3
          ? "grid gap-3 md:grid-cols-3"
          : "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:overflow-visible md:snap-none md:pb-0"
      }
    >
      {spaces.map((space) => {
        const isSelected = space.id === selectedId;
        return (
          <button
            key={space.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(space.id)}
            disabled={isSingle}
            className={`flex min-w-[200px] snap-start flex-col items-start rounded-lg border p-4 text-left transition-all
              ${
                isSelected
                  ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                  : "border-border bg-card hover:border-accent/40"
              }
              ${isSingle ? "cursor-default" : "cursor-pointer"}
              md:min-w-0`}
          >
            <span className="font-heading text-sm font-medium tracking-tight">
              {space.name}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              定員{space.capacity}名
            </span>
            <span className="mt-0.5 font-heading text-sm text-accent">
              &yen;{space.hourlyPrice.toLocaleString()}/時間
            </span>
          </button>
        );
      })}
    </div>
  );
}
