"use client";

import type { ReactElement } from "react";

interface GuestStepperProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max: number;
}

export function GuestStepper({
  value,
  onChange,
  min = 1,
  max,
}: GuestStepperProps): ReactElement {
  return (
    <div className="flex items-center gap-1">
      <label className="mr-3 text-sm font-medium text-foreground">
        利用人数
      </label>
      <button
        type="button"
        aria-label="利用人数を減らす"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border
          text-lg font-medium transition-colors hover:bg-surface
          disabled:opacity-40 disabled:pointer-events-none"
      >
        −
      </button>
      <span
        aria-live="polite"
        className="min-w-12 text-center font-heading text-lg"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="利用人数を増やす"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border
          text-lg font-medium transition-colors hover:bg-surface
          disabled:opacity-40 disabled:pointer-events-none"
      >
        +
      </button>
      <span className="ml-1 text-sm text-muted-foreground">名</span>
    </div>
  );
}
