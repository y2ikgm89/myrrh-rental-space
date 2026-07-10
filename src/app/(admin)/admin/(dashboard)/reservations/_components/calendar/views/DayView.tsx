"use client";

import { useSyncExternalStore } from "react";
import { isToday } from "date-fns";
import { cn } from "@/shared/lib/cn";
import {
  formatJstDayOfMonth,
  formatJstWeekdayShort,
} from "@/shared/lib/date-format";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  maxConcurrentColumns,
  isPastJstDay,
  isEventEnded,
  minutesSinceJstBusinessStart,
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

  // hydration mismatch 回避: useSyncExternalStore で client-only gate
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // eslint-disable-next-line @eslint-react/purity -- Client component: now indicator
  const now = isClient ? new Date() : null;
  const past = now !== null && isPastJstDay(date, now);
  const businessTotalMinutes =
    (DEFAULT_BUSINESS_HOURS.endHour - DEFAULT_BUSINESS_HOURS.startHour) * 60;
  const nowMinutes = now ? minutesSinceJstBusinessStart(now) : 0;
  // 今日列のみ意味あり。営業時間外も 0 / gridHeight に clamp。
  const nowOffsetPx =
    now === null || !today
      ? null
      : nowMinutes <= 0
        ? 0
        : nowMinutes >= businessTotalMinutes
          ? gridHeight
          : (nowMinutes / 60) * CALENDAR_LAYOUT.pixelsPerHour;

  // WeekView と同形の単一カラム。CalendarToolbar の dateLabel が SSoT のため
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
          {formatJstWeekdayShort(date)}
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center text-lg font-semibold tabular-nums",
            today && "rounded-full bg-primary text-primary-foreground",
          )}
        >
          {formatJstDayOfMonth(date)}
        </div>
      </div>
    ),
    body: (
      <div className="absolute inset-0 px-1">
        {positioned.map((event) => (
          <EventCell
            key={event.id}
            event={event}
            onClick={onEventClick}
            isPast={now !== null && isEventEnded(event.endTime, now)}
          />
        ))}
      </div>
    ),
    ...(past && !today ? { bodyClassName: "bg-muted/30" } : {}),
    ...(today ? { isTodayColumn: true as const } : {}),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <TimeGrid
        timeSlots={timeSlots}
        gridHeight={gridHeight}
        columns={[column]}
        ariaLabel="日次予約タイムグリッド"
        nowOffsetPx={nowOffsetPx}
      />
    </div>
  );
}
