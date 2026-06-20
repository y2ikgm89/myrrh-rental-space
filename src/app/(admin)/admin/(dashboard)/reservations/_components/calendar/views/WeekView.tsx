"use client";

import { useSyncExternalStore } from "react";
import { format, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/shared/lib/cn";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  maxConcurrentColumns,
  isSameJstDay,
  isPastJstDay,
  minutesSinceJstBusinessStart,
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

  // 「過去日 muted / Now ライン」は now に依存し SSR (UTC) と CSR (JST) で差が
  // 出るため hydration mismatch を起こす。React 公式の useSyncExternalStore で
  // client-only に gate する (getServerSnapshot=false → hydration 一致、subscribe
  // 後 getSnapshot=true で client-only 再描画)。MEMORY:[project_hydration-418-date-tz-2026-06-17]
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // eslint-disable-next-line @eslint-react/purity -- Client component: now indicator
  const now = isClient ? new Date() : null;
  const businessTotalMinutes =
    (DEFAULT_BUSINESS_HOURS.endHour - DEFAULT_BUSINESS_HOURS.startHour) * 60;
  const nowMinutes = now ? minutesSinceJstBusinessStart(now) : 0;
  // 営業時間外も 0 / gridHeight に clamp して past/future を完結させる。
  // server (now=null) では nowOffsetPx=null → TimeGrid は overlay を描画しない。
  const nowOffsetPx =
    now === null
      ? null
      : nowMinutes <= 0
        ? 0
        : nowMinutes >= businessTotalMinutes
          ? gridHeight
          : (nowMinutes / 60) * CALENDAR_LAYOUT.pixelsPerHour;

  const columns: TimeGridColumn[] = displayDays.map((day, index) => {
    const dayEvents = events.filter((e) => isSameJstDay(e.startTime, day));
    const positioned = layoutOverlappingEvents(dayEvents);
    const maxCols = maxConcurrentColumns(positioned);
    const minWidthPx = Math.max(
      CALENDAR_LAYOUT.weekColumnMinPx,
      maxCols * CALENDAR_LAYOUT.weekSubcolumnMinPx,
    );
    const today = isToday(day);
    const past = now !== null && isPastJstDay(day, now);

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
      // 過去日: 全体 muted (今日列は TimeGrid が past/future overlay で処理)
      ...(past && !today ? { bodyClassName: "bg-muted/30" } : {}),
      ...(today ? { isTodayColumn: true as const } : {}),
    };
  });

  const hasToday = displayDays.some((d) => isToday(d));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <TimeGrid
        timeSlots={timeSlots}
        gridHeight={gridHeight}
        columns={columns}
        ariaLabel="週間予約タイムグリッド"
        nowOffsetPx={hasToday ? nowOffsetPx : null}
      />
    </div>
  );
}
