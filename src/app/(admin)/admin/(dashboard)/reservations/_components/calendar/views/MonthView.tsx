"use client";

import { useState, useSyncExternalStore } from "react";
import { isSameMonth, isToday } from "date-fns";
import { cn } from "@/shared/lib/cn";
import {
  formatDateWithWeekday,
  formatJstDateString,
  formatJstDayOfMonth,
} from "@/shared/lib/date-format";
import {
  getWeekdayHeaders,
  getWeekdayColorClass,
  isSameJstDay,
  isPastJstDay,
  isEventEnded,
} from "@/admin/lib/calendar";
import type { CalendarEvent, CalendarDateRange } from "@/admin/lib/calendar";
import { EventBadge } from "../EventCell";

interface MonthViewProps {
  dateRange: CalendarDateRange;
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick?: (date: Date) => void;
}

const MAX_VISIBLE_EVENTS = 3;

export function MonthView({
  dateRange,
  currentDate,
  events,
  onEventClick,
  onDayClick,
}: MonthViewProps) {
  const weekdays = getWeekdayHeaders();
  // JST 固定の月キー (browser local TZ 依存を避ける)。YYYY-MM-DD の先頭 7 文字を取る。
  const monthKey = formatJstDateString(dateRange.start).slice(0, 7);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  // hydration mismatch 回避: useSyncExternalStore で client-only gate
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // eslint-disable-next-line @eslint-react/purity -- Client component
  const now = isClient ? new Date() : null;

  const weeks: Date[][] = [];
  const { displayDates } = dateRange;
  for (let i = 0; i < displayDates.length; i += 7) {
    weeks.push(displayDates.slice(i, i + 7));
  }

  const getEventsForDay = (day: Date) =>
    events
      .filter((e) => isSameJstDay(e.startTime, day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleDayClick = (day: Date) => {
    if (onDayClick) onDayClick(day);
  };

  const toggleExpandDay = (dayId: string) => {
    const fullKey = `${monthKey}-${dayId}`;
    setExpandedDay((prev) => (prev === fullKey ? null : fullKey));
  };

  const isExpanded = (dayId: string) => expandedDay === `${monthKey}-${dayId}`;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      {/*
       * 曜日ヘッダーと日付グリッドを 1 つの `overflow-auto` container に入れ、
       * 曜日行に `sticky top-0` を付けて縦スクロール時に固定表示させる。
       * `min-w-[35rem]` (= 7 × 5rem, 320px iPhone SE でも各セル 80px 確保) が
       * 横スクロールの下限を決め、`sm:` 以上 (640px+) では通常のフル幅に戻る。
       * WeekView / DayView / ResourceView が TimeGrid で採用している 2D スクロール
       * SSoT と同型。
       */}
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <div className="min-w-[35rem] sm:min-w-0">
          {/* 曜日ヘッダー (縦スクロール時に sticky で残す) */}
          <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-muted/40">
            {weekdays.map((day, index) => (
              <div
                key={day}
                className={cn(
                  "border-r p-2 text-center text-sm font-semibold last:border-r-0",
                  getWeekdayColorClass(index),
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 日付グリッド */}
          {weeks.map((week) => {
            const firstDay = week[0];
            if (!firstDay) return null;
            return (
              <div
                key={formatJstDateString(firstDay)}
                className="grid grid-cols-7 border-b last:border-b-0"
              >
                {week.map((day, dayIndex) => {
                  const dayEvents = getEventsForDay(day);
                  const dayId = formatJstDateString(day);
                  const dayExpanded = isExpanded(dayId);
                  const visibleEvents = dayExpanded
                    ? dayEvents
                    : dayEvents.slice(0, MAX_VISIBLE_EVENTS);
                  const hiddenCount = dayEvents.length - MAX_VISIBLE_EVENTS;
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const todayCell = isToday(day);
                  const isPast =
                    !todayCell && now !== null && isPastJstDay(day, now);

                  return (
                    <div
                      key={dayId}
                      className={cn(
                        "relative flex min-h-[140px] flex-col gap-1 border-r p-1.5 last:border-r-0 transition-colors",
                        // 過去日 / 当月外 → muted (Google Calendar / Outlook 公式パターン)
                        (isPast || !isCurrentMonth) && "bg-muted/30",
                        // 今日 → primary tint (muted を上書き; 上の cn 順で tailwind-merge が解決)
                        todayCell && "bg-primary/5",
                      )}
                    >
                      {/* 日付ラベル + 件数バッジ */}
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          aria-label={`${formatDateWithWeekday(day)} を日表示で開く`}
                          {...(todayCell
                            ? { "aria-current": "date" as const }
                            : {})}
                          className={cn(
                            "flex min-h-11 min-w-11 items-center justify-center rounded-full px-1.5 text-sm font-semibold tabular-nums transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            "hover:bg-accent",
                            !isCurrentMonth && "text-muted-foreground",
                            todayCell &&
                              "bg-primary text-primary-foreground hover:bg-primary/90",
                            !todayCell && getWeekdayColorClass(dayIndex),
                          )}
                          onClick={() => handleDayClick(day)}
                        >
                          {formatJstDayOfMonth(day)}
                        </button>
                        {dayEvents.length > 0 && (
                          <span
                            aria-label={`${dayEvents.length} 件の予約`}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums text-muted-foreground"
                          >
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* イベント一覧 */}
                      <div className="flex-1 overflow-hidden">
                        {visibleEvents.map((event) => (
                          <EventBadge
                            key={event.id}
                            event={event}
                            onClick={onEventClick}
                            isPast={
                              now !== null && isEventEnded(event.endTime, now)
                            }
                          />
                        ))}

                        {hiddenCount > 0 && !dayExpanded && (
                          <button
                            type="button"
                            className="mt-0.5 inline-flex min-h-11 w-full items-center rounded px-1.5 py-0.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => toggleExpandDay(dayId)}
                          >
                            + 他 {hiddenCount} 件
                          </button>
                        )}

                        {dayExpanded && hiddenCount > 0 && (
                          <button
                            type="button"
                            className="mt-0.5 inline-flex min-h-11 w-full items-center rounded px-1.5 py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => toggleExpandDay(dayId)}
                          >
                            折りたたむ
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
