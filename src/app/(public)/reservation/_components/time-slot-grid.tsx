"use client";

import type { ReactElement } from "react";
import type { TimeSlot } from "@/shared/lib/reservation/types";

interface TimeSlotGridProps {
  readonly slots: readonly TimeSlot[];
  readonly selectedTime: string | null;
  readonly onSelect: (time: string) => void;
  readonly isLoading: boolean;
}

export function TimeSlotGrid({
  slots,
  selectedTime,
  onSelect,
  isLoading,
}: TimeSlotGridProps): ReactElement {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 md:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="min-h-11 animate-pulse rounded-lg bg-surface"
          />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        この日は予約できる時間帯がありません
      </p>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="開始時間を選択"
      className="grid grid-cols-3 gap-2 md:grid-cols-4"
    >
      {slots.map((slot) => {
        const isSelected = slot.time === selectedTime;
        const isUnavailable = !slot.available;

        return (
          <button
            key={slot.time}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-disabled={isUnavailable}
            disabled={isUnavailable}
            onClick={() => onSelect(slot.time)}
            className={`min-h-11 rounded-lg border text-sm font-medium transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
              ${
                isSelected
                  ? "border-accent bg-accent/10 text-accent ring-1 ring-accent/30"
                  : isUnavailable
                    ? "border-border/50 bg-surface/50 text-muted-foreground/40 line-through cursor-not-allowed"
                    : "border-border bg-card text-foreground hover:border-accent/40 hover:bg-surface cursor-pointer"
              }`}
          >
            {slot.time}
          </button>
        );
      })}
    </div>
  );
}
