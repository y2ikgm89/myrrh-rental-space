"use client";

import { format, isSameDay, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/shared/lib/cn";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  getWeekdayColorClass,
  DEFAULT_BUSINESS_HOURS,
  PIXELS_PER_HOUR,
} from "@/admin/lib/calendar";
import type {
  CalendarEvent,
  CalendarDateRange,
  PositionedEvent,
} from "@/admin/lib/calendar";
import { EventCell } from "../EventCell";
import { TimeGrid, type TimeGridColumn } from "./TimeGrid";

interface WeekViewProps {
  dateRange: CalendarDateRange;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

/** 1 サブカラム (重複時の各イベントレーン) の最小幅 — WCAG 2.5.5 / 文字 + アイコンが収まる最低限 */
const SUBCOLUMN_MIN_PX = 80;
/** 重複なし日の最小幅 — そもそも 1 日カラムが極端に狭くなることを防ぐ */
const DAY_COLUMN_MIN_PX = 140;

function maxConcurrentColumns(positioned: PositionedEvent[]): number {
  if (positioned.length === 0) return 1;
  const minWidthPct = positioned.reduce(
    (min, e) => Math.min(min, e.position.width),
    100,
  );
  return Math.max(1, Math.round(100 / Math.max(minWidthPct + 1, 1)));
}

export function WeekView({ dateRange, events, onEventClick }: WeekViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const displayDays = dateRange.displayDates.slice(0, 7);
  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;

  const columns: TimeGridColumn[] = displayDays.map((day, index) => {
    const dayEvents = events.filter((e) => isSameDay(e.startTime, day));
    const positioned = layoutOverlappingEvents(dayEvents);
    const maxCols = maxConcurrentColumns(positioned);
    const minWidthPx = Math.max(DAY_COLUMN_MIN_PX, maxCols * SUBCOLUMN_MIN_PX);
    const today = isToday(day);

    return {
      key: day.toISOString(),
      minWidthPx,
      header: (
        <div
          className={cn(
            "flex h-full flex-col items-center justify-center gap-0.5 px-2 py-2",
            today && "bg-primary/10",
          )}
        >
          <div
            className={cn("text-xs font-medium", getWeekdayColorClass(index))}
          >
            {format(day, "E", { locale: ja })}
          </div>
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center text-lg font-semibold tabular-nums",
              today && "rounded-full bg-primary text-primary-foreground",
            )}
          >
            {format(day, "d")}
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
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <TimeGrid
        timeSlots={timeSlots}
        gridHeight={gridHeight}
        columns={columns}
      />
    </div>
  );
}
