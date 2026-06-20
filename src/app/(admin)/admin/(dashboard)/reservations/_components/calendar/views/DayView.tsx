"use client";

import { format, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/shared/lib/cn";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  getWeekdayColorClass,
  DEFAULT_BUSINESS_HOURS,
  PIXELS_PER_HOUR,
} from "@/admin/lib/calendar";
import type { CalendarEvent, PositionedEvent } from "@/admin/lib/calendar";
import { EventCell } from "../EventCell";
import { TimeGrid, type TimeGridColumn } from "./TimeGrid";

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

/** 重複時の 1 サブカラム最小幅 */
const SUBCOLUMN_MIN_PX = 120;
/** 単一日カラムの最小幅 — 1fr で広がるが極端な狭幅を避ける */
const DAY_COLUMN_MIN_PX = 320;

function maxConcurrentColumns(positioned: PositionedEvent[]): number {
  if (positioned.length === 0) return 1;
  const minWidthPct = positioned.reduce(
    (min, e) => Math.min(min, e.position.width),
    100,
  );
  return Math.max(1, Math.round(100 / Math.max(minWidthPct + 1, 1)));
}

export function DayView({ date, events, onEventClick }: DayViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const positioned = layoutOverlappingEvents(events);
  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;

  const maxCols = maxConcurrentColumns(positioned);
  const minWidthPx = Math.max(DAY_COLUMN_MIN_PX, maxCols * SUBCOLUMN_MIN_PX);
  const today = isToday(date);
  const dayOfWeek = date.getDay();

  // WeekView と同形の単一カラム — 列ヘッダーは weekday + 日付ピル、bodyは bg-primary/5 で today を tint。
  // 大きな内部 BIG 日付ヘッダーは CalendarToolbar の dateLabel と重複するため撤去。
  const column: TimeGridColumn = {
    key: date.toISOString(),
    minWidthPx,
    header: (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-0.5 px-2 py-2",
          today && "bg-primary/10",
        )}
      >
        <div
          className={cn("text-xs font-medium", getWeekdayColorClass(dayOfWeek))}
        >
          {format(date, "E", { locale: ja })}
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center text-lg font-semibold tabular-nums",
            today && "rounded-full bg-primary text-primary-foreground",
          )}
        >
          {format(date, "d")}
        </div>
      </div>
    ),
    body: (
      <div className="absolute inset-0 px-1">
        {positioned.map((event) => (
          <EventCell key={event.id} event={event} onClick={onEventClick} />
        ))}
      </div>
    ),
    ...(today ? { bodyClassName: "bg-primary/5" } : {}),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <TimeGrid
        timeSlots={timeSlots}
        gridHeight={gridHeight}
        columns={[column]}
      />
    </div>
  );
}
