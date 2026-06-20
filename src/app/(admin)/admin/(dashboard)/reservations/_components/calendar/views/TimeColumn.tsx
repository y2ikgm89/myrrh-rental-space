"use client";

import { CALENDAR_LAYOUT } from "@/admin/lib/calendar";

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
    <div className="h-full">
      {timeSlots.map((time) => (
        <div
          key={time}
          style={{ height: `${CALENDAR_LAYOUT.pixelsPerHour}px` }}
          className="flex items-start justify-end border-b pr-2 pt-1 text-xs font-medium tabular-nums text-muted-foreground last:border-b-0"
        >
          {time}
        </div>
      ))}
    </div>
  );
}
