"use client";

import type { ReactElement } from "react";

const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 300, 360] as const;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

interface DurationPillsProps {
  readonly selectedMinutes: number | null;
  readonly onSelect: (minutes: number) => void;
  readonly maxMinutes: number;
}

export function DurationPills({
  selectedMinutes,
  onSelect,
  maxMinutes,
}: DurationPillsProps): ReactElement {
  const availableOptions = DURATION_OPTIONS.filter((d) => d <= maxMinutes);

  if (availableOptions.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        選択可能な利用時間がありません
      </p>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="利用時間を選択"
      className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0"
    >
      {availableOptions.map((minutes) => {
        const isSelected = minutes === selectedMinutes;
        return (
          <button
            key={minutes}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(minutes)}
            className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
              ${
                isSelected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground hover:border-foreground/30"
              }`}
          >
            {formatDuration(minutes)}
          </button>
        );
      })}
    </div>
  );
}
