"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
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
      <div
        className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        aria-busy="true"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="min-h-11 animate-pulse bg-border/30" />
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
      className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
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
            className={cn(
              "min-h-11 border text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isSelected
                ? "border-accent bg-accent text-accent-foreground"
                : isUnavailable
                  ? "cursor-not-allowed border-border/40 text-muted-foreground/30 line-through"
                  : "cursor-pointer border-border text-foreground hover:border-foreground/30",
            )}
          >
            {slot.time}
          </button>
        );
      })}
    </div>
  );
}
