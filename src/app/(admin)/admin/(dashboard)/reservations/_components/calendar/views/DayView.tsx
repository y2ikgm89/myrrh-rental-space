"use client";

import { format, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/shared/lib/cn";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  maxConcurrentColumns,
  getWeekdayColorClass,
  DEFAULT_BUSINESS_HOURS,
  CALENDAR_LAYOUT,
} from "@/admin/lib/calendar";
import type { CalendarEvent } from "@/admin/lib/calendar";
import { EventCell } from "../EventCell";
import { TimeGrid, type TimeGridColumn } from "./TimeGrid";

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

export function DayView({ date, events, onEventClick }: DayViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const positioned = layoutOverlappingEvents(events);
  const gridHeight = timeSlots.length * CALENDAR_LAYOUT.pixelsPerHour;

  const maxCols = maxConcurrentColumns(positioned);
  const minWidthPx = Math.max(
    CALENDAR_LAYOUT.dayColumnMinPx,
    maxCols * CALENDAR_LAYOUT.daySubcolumnMinPx,
  );
  const today = isToday(date);
  const dayOfWeek = date.getDay();

  // WeekView と同形の単一カラム — 列ヘッダーは weekday + 日付ピル、body は
  // bg-primary/5 で today を tint。CalendarToolbar の dateLabel が SSoT のため
  // 大きな内部 BIG 日付ヘッダーは持たない。
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
        ariaLabel="日次予約タイムグリッド"
      />
    </div>
  );
}
