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
  "flex h-10 w-10 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CalendarMonthNav({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  onJump,
}: CalendarMonthNavProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex items-center gap-2 justify-self-start">
        <button
          type="button"
          onClick={onToday}
          className="h-10 border border-border px-4 text-xs tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <button
          type="button"
          onClick={onNext}
          className={CHEVRON_BUTTON_CLASS}
          aria-label="次の月"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="justify-self-center">
        <MonthPicker year={year} month={month} onSelect={onJump} />
      </div>

      <div aria-hidden="true" />
    </div>
  );
}
