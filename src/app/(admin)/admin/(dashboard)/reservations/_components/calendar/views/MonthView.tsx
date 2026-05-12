"use client";

import { useState } from "react";
import { format, isSameDay, isSameMonth, isToday } from "date-fns";
import { cn } from "@/shared/lib/cn";
import { getWeekdayHeaders, getWeekdayColorClass } from "@/admin/lib/calendar";
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
  const monthKey = format(dateRange.start, "yyyy-MM");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const weeks: Date[][] = [];
  const { displayDates } = dateRange;
  for (let i = 0; i < displayDates.length; i += 7) {
    weeks.push(displayDates.slice(i, i + 7));
  }

  const getEventsForDay = (day: Date) =>
    events
      .filter((e) => isSameDay(new Date(e.startTime), day))
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
      {/* 曜日ヘッダー (上部固定) */}
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/40">
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

      {/* 日付グリッド (内部縦スクロール — 6週分が viewport 高を超えても card 外枠ははみ出さない) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {weeks.map((week) => {
          const firstDay = week[0];
          if (!firstDay) return null;
          return (
            <div
              key={format(firstDay, "yyyy-MM-dd")}
              className="grid flex-1 grid-cols-7 border-b last:border-b-0"
            >
              {week.map((day, dayIndex) => {
                const dayEvents = getEventsForDay(day);
                const dayId = format(day, "yyyy-MM-dd");
                const dayExpanded = isExpanded(dayId);
                const visibleEvents = dayExpanded
                  ? dayEvents
                  : dayEvents.slice(0, MAX_VISIBLE_EVENTS);
                const hiddenCount = dayEvents.length - MAX_VISIBLE_EVENTS;
                const isCurrentMonth = isSameMonth(day, currentDate);
                const todayCell = isToday(day);

                return (
                  <div
                    key={dayId}
                    className={cn(
                      "relative flex min-h-[140px] flex-col gap-1 border-r p-1.5 last:border-r-0 transition-colors",
                      !isCurrentMonth && "bg-muted/30",
                      todayCell && "bg-primary/5",
                    )}
                  >
                    {/* 日付ラベル + 件数バッジ */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        aria-label={`${format(day, "yyyy年M月d日")} を日表示で開く`}
                        className={cn(
                          "flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-semibold tabular-nums transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          "hover:bg-accent",
                          !isCurrentMonth && "text-muted-foreground",
                          todayCell &&
                            "bg-primary text-primary-foreground hover:bg-primary/90",
                          !todayCell && getWeekdayColorClass(dayIndex),
                        )}
                        onClick={() => handleDayClick(day)}
                      >
                        {format(day, "d")}
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
                        />
                      ))}

                      {hiddenCount > 0 && !dayExpanded && (
                        <button
                          type="button"
                          className="mt-0.5 inline-flex min-h-6 w-full items-center rounded px-1.5 py-0.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => toggleExpandDay(dayId)}
                        >
                          + 他 {hiddenCount} 件
                        </button>
                      )}

                      {dayExpanded && hiddenCount > 0 && (
                        <button
                          type="button"
                          className="mt-0.5 inline-flex min-h-6 w-full items-center rounded px-1.5 py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  );
}
