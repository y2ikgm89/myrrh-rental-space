"use client";

import { CALENDAR_LAYOUT } from "@/admin/lib/calendar";
import { cn } from "@/shared/lib/cn";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import { ImperativeCssScope } from "@/shared/lib/csp/imperative-css-scope";

interface TimeColumnProps {
  timeSlots: string[];
}

/**
 * カレンダーグリッド左端の時刻列。
 * 親側で `sticky left-0` を付けて横スクロール時に固定表示する。
 *
 * スロット高は CALENDAR_LAYOUT.pixelsPerHour (SSoT) に追従する。
 */
export function TimeColumn({ timeSlots }: TimeColumnProps) {
  return (
    <ImperativeCssScope
      className="h-full"
      cssVars={{
        [CSS_VAR.calendarSlotHeight]: `${CALENDAR_LAYOUT.pixelsPerHour}px`,
      }}
    >
      {timeSlots.map((time) => (
        <div
          key={time}
          className={cn(
            "flex items-start justify-end border-b pr-2 pt-1 text-xs font-medium tabular-nums text-muted-foreground last:border-b-0",
            CSS_VAR_CLASS.calendarSlotHeight,
          )}
        >
          {time}
        </div>
      ))}
    </ImperativeCssScope>
  );
}
