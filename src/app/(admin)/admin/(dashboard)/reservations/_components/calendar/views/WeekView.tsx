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
import { TimeColumn } from "./TimeColumn";

interface WeekViewProps {
  dateRange: CalendarDateRange;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

/** 1 サブカラム (重複時の各イベントレーン) の最小幅 — WCAG 2.5.5 / 文字 + アイコンが収まる最低限 */
const SUBCOLUMN_MIN_PX = 80;
/** 重複なし日の最小幅 — そもそも 1 日カラムが極端に狭くなることを防ぐ */
const DAY_COLUMN_MIN_PX = 140;

/**
 * 1 日カラム内の最大同時並走イベント数を計算する。
 * `layoutOverlappingEvents` の戻り値は `position.width` (%) を持つので、最小値から逆算できる。
 */
function maxConcurrentColumns(positioned: PositionedEvent[]): number {
  if (positioned.length === 0) return 1;
  // position.width は (100 / columnCount - 1)% で生成されるので最小幅から columnCount を逆算
  const minWidthPct = positioned.reduce(
    (min, e) => Math.min(min, e.position.width),
    100,
  );
  // 100 / (minWidth + 1) ≒ columnCount
  return Math.max(1, Math.round(100 / Math.max(minWidthPct + 1, 1)));
}

export function WeekView({ dateRange, events, onEventClick }: WeekViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const displayDays = dateRange.displayDates.slice(0, 7);

  // 日別イベント配置（React Compiler が自動メモ化）
  const eventsByDay = displayDays.map((day) => {
    const dayEvents = events.filter((e) => isSameDay(e.startTime, day));
    return layoutOverlappingEvents(dayEvents);
  });

  // 日ごとの最大同時並走数を計算 → 必要なカラム最小幅を決定
  const dayColumnMinWidths = eventsByDay.map((positioned) => {
    const maxCols = maxConcurrentColumns(positioned);
    return Math.max(DAY_COLUMN_MIN_PX, maxCols * SUBCOLUMN_MIN_PX);
  });

  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;

  // CSS Grid columns: 60px (時刻列) + 各日 minmax(計算した最小幅, 1fr)
  const gridTemplate = [
    "60px",
    ...dayColumnMinWidths.map((w) => `minmax(${w}px, 1fr)`),
  ].join(" ");

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      {/* グリッド全体を横スクロール対応 */}
      <div className="flex-1 overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {/* ヘッダー行（sticky top） */}
          <div className="sticky top-0 z-20 border-b border-r bg-muted/40" />
          {displayDays.map((day, index) => (
            <div
              key={day.toISOString()}
              className={cn(
                "sticky top-0 z-20 flex flex-col items-center gap-0.5 border-b border-r bg-muted/40 px-2 py-2 last:border-r-0",
                isToday(day) && "bg-primary/10",
              )}
            >
              <div
                className={cn(
                  "text-xs font-medium",
                  getWeekdayColorClass(index),
                )}
              >
                {format(day, "E", { locale: ja })}
              </div>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center text-lg font-semibold tabular-nums",
                  isToday(day) &&
                    "rounded-full bg-primary text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}

          {/* 時刻列 (sticky left) */}
          <div
            className="sticky left-0 z-10 border-r bg-card"
            style={{ height: `${gridHeight}px` }}
          >
            <TimeColumn timeSlots={timeSlots} />
          </div>

          {/* 日別列 */}
          {displayDays.map((day, dayIndex) => (
            <div
              key={day.toISOString()}
              className={cn(
                "relative border-r last:border-r-0",
                isToday(day) && "bg-primary/5",
              )}
              style={{ height: `${gridHeight}px` }}
            >
              {/* 時間帯の罫線 */}
              {timeSlots.map((time) => (
                <div key={time} className="h-[60px] border-b last:border-b-0" />
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
