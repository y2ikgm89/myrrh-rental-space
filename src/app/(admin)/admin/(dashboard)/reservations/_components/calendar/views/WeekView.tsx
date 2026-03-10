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
import type { CalendarEvent, CalendarDateRange } from "@/admin/lib/calendar";
import { EventCell } from "../EventCell";
import { TimeColumn } from "./TimeColumn";

interface WeekViewProps {
  dateRange: CalendarDateRange;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

export function WeekView({ dateRange, events, onEventClick }: WeekViewProps) {
  // React Compilerが自動メモ化
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const displayDays = dateRange.displayDates.slice(0, 7);

  // 日別にイベントをグループ化し、配置計算（React Compilerが自動メモ化）
  const eventsByDay = displayDays.map((day) => {
    const dayEvents = events.filter((e) => isSameDay(e.startTime, day));
    return layoutOverlappingEvents(dayEvents);
  });

  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      {/* ヘッダー */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/50">
        <div className="border-r p-2" />
        {displayDays.map((day, index) => (
          <div
            key={day.toISOString()}
            className={cn(
              "border-r p-2 text-center last:border-r-0",
              isToday(day) && "bg-primary/5",
            )}
          >
            <div
              className={cn("text-sm font-medium", getWeekdayColorClass(index))}
            >
              {format(day, "E", { locale: ja })}
            </div>
            <div
              className={cn(
                "text-xl",
                isToday(day) &&
                  "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground mx-auto",
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* グリッド */}
      <div className="flex-1 overflow-auto">
        <div
          className="relative grid grid-cols-[60px_repeat(7,1fr)]"
          style={{ height: `${gridHeight}px` }}
        >
          <TimeColumn timeSlots={timeSlots} />

          {/* 日列 */}
          {displayDays.map((day, dayIndex) => (
            <div
              key={day.toISOString()}
              className={cn(
                "relative border-r last:border-r-0",
                isToday(day) && "bg-primary/5",
              )}
            >
              {/* 背景グリッド */}
              {timeSlots.map((time) => (
                <div key={time} className="h-[60px] border-b" />
              ))}

              {/* イベント */}
              <div className="absolute inset-0 px-0.5">
                {(eventsByDay[dayIndex] ?? []).map((event) => (
                  <EventCell
                    key={event.id}
                    event={event}
                    onClick={onEventClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
