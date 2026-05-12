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
import { TimeColumn } from "./TimeColumn";

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

/** 重複時の 1 サブカラム最小幅 */
const SUBCOLUMN_MIN_PX = 120;
/** 重複なし時の最小幅 (1 日カラム) */
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
  const positionedEvents = layoutOverlappingEvents(events);
  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;
  const dayOfWeek = date.getDay();

  const maxCols = maxConcurrentColumns(positionedEvents);
  const dayColumnMinWidth = Math.max(
    DAY_COLUMN_MIN_PX,
    maxCols * SUBCOLUMN_MIN_PX,
  );

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      {/* 日付ヘッダー */}
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              isToday(date) && "text-primary",
            )}
          >
            {format(date, "M月d日", { locale: ja })}
          </div>
          <div
            className={cn(
              "text-sm font-medium",
              getWeekdayColorClass(dayOfWeek),
            )}
          >
            ({format(date, "E", { locale: ja })})
          </div>
          {isToday(date) && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              今日
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {events.length} 件の予約
        </div>
      </div>

      {/* グリッド */}
      <div className="flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `60px minmax(${dayColumnMinWidth}px, 1fr)`,
            height: `${gridHeight}px`,
          }}
        >
          <div className="sticky left-0 z-10 border-r bg-card">
            <TimeColumn timeSlots={timeSlots} />
          </div>

          <div className={cn("relative", isToday(date) && "bg-primary/5")}>
            {/* 時間帯の罫線 */}
            {timeSlots.map((time) => (
              <div key={time} className="h-[60px] border-b last:border-b-0" />
            ))}

            {/* イベント */}
            <div className="absolute inset-0 px-2">
              {positionedEvents.map((event) => (
                <EventCell
                  key={event.id}
                  event={event}
                  onClick={onEventClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 空状態 */}
      {events.length === 0 && (
        <div className="border-t bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          この日の予約はありません
        </div>
      )}
    </div>
  );
}
