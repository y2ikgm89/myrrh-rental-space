"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { MonthPicker } from "./month-picker";

interface CalendarMonthNavProps {
  readonly year: number;
  /** 0-indexed */
  readonly month: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onToday: () => void;
  readonly onJump: (year: number, month: number) => void;
}

const CHEVRON_BUTTON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CalendarMonthNav({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  onJump,
}: CalendarMonthNavProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={onToday}
        className="inline-flex h-11 items-center border border-border px-4 text-xs tracking-eyebrow text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        今月
      </button>
      <button
        type="button"
        onClick={onPrev}
        className={CHEVRON_BUTTON_CLASS}
        aria-label="前の月"
      >
        <IconChevronLeft className="h-5 w-5" />
      </button>
      <MonthPicker year={year} month={month} onSelect={onJump} />
      <button
        type="button"
        onClick={onNext}
        className={CHEVRON_BUTTON_CLASS}
        aria-label="次の月"
      >
        <IconChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
