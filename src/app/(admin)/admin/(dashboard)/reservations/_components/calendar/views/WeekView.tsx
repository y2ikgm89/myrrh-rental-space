"use client";

import { format, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/shared/lib/cn";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  maxConcurrentColumns,
  isSameJstDay,
  getWeekdayColorClass,
  DEFAULT_BUSINESS_HOURS,
  CALENDAR_LAYOUT,
} from "@/admin/lib/calendar";
import type { CalendarEvent, CalendarDateRange } from "@/admin/lib/calendar";
import { EventCell } from "../EventCell";
import { TimeGrid, type TimeGridColumn } from "./TimeGrid";

interface WeekViewProps {
  dateRange: CalendarDateRange;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

export function WeekView({ dateRange, events, onEventClick }: WeekViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const displayDays = dateRange.displayDates.slice(0, 7);
  const gridHeight = timeSlots.length * CALENDAR_LAYOUT.pixelsPerHour;

  const columns: TimeGridColumn[] = displayDays.map((day, index) => {
    const dayEvents = events.filter((e) => isSameJstDay(e.startTime, day));
    const positioned = layoutOverlappingEvents(dayEvents);
    const maxCols = maxConcurrentColumns(positioned);
    const minWidthPx = Math.max(
      CALENDAR_LAYOUT.weekColumnMinPx,
      maxCols * CALENDAR_LAYOUT.weekSubcolumnMinPx,
    );
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
        ariaLabel="週間予約タイムグリッド"
      />
    </div>
  );
}
