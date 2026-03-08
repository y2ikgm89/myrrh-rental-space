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

  // 月のキーを生成（月が変わると展開状態がリセットされる）
  const monthKey = format(dateRange.start, "yyyy-MM");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // 週単位にグループ化（React Compilerが自動メモ化）
  const weeks: Date[][] = [];
  const { displayDates } = dateRange;
  for (let i = 0; i < displayDates.length; i += 7) {
    weeks.push(displayDates.slice(i, i + 7));
  }

  // 日別イベント取得
  const getEventsForDay = (day: Date) => {
    return events
      .filter((e) => isSameDay(new Date(e.startTime), day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const handleDayClick = (day: Date) => {
    if (onDayClick) {
      onDayClick(day);
    }
  };

  const toggleExpandDay = (dayId: string) => {
    // 月キーを含めることで、月が変わると自動的にリセット
    const fullKey = `${monthKey}-${dayId}`;
    setExpandedDay((prev) => (prev === fullKey ? null : fullKey));
  };

  const isExpanded = (dayId: string) => expandedDay === `${monthKey}-${dayId}`;

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {weekdays.map((day, index) => (
          <div
            key={day}
            className={cn(
              "border-r p-2 text-center text-sm font-medium last:border-r-0",
              getWeekdayColorClass(index),
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="flex flex-1 flex-col">
        {weeks.map((week) => {
          const firstDay = week[0];
          if (!firstDay) return null;
          return (
          <div
            key={format(firstDay, 'yyyy-MM-dd')}
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

              return (
                <div
                  key={dayId}
                  className={cn(
                    "relative flex min-h-[100px] flex-col border-r p-1 last:border-r-0",
                    !isCurrentMonth && "bg-muted/50",
                    isToday(day) && "bg-primary/5",
                  )}
                >
                  {/* 日付ラベル */}
                  <button
                    type="button"
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-sm transition-colors hover:bg-accent",
                      !isCurrentMonth && "text-muted-foreground",
                      isToday(day) &&
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                      getWeekdayColorClass(dayIndex),
                    )}
                    onClick={() => handleDayClick(day)}
                  >
                    {format(day, "d")}
                  </button>

                  {/* イベント一覧 */}
                  <div className="flex-1 overflow-hidden">
                    {visibleEvents.map((event) => (
                      <EventBadge
                        key={event.id}
                        event={event}
                        onClick={onEventClick}
                      />
                    ))}

                    {/* 「他N件」ボタン */}
                    {hiddenCount > 0 && !dayExpanded && (
                      <button
                        type="button"
                        className="mt-0.5 w-full rounded px-1 py-0.5 text-left text-[10px] text-primary hover:bg-accent"
                        onClick={() => toggleExpandDay(dayId)}
                      >
                        他 {hiddenCount} 件
                      </button>
                    )}

                    {/* 折りたたみボタン */}
                    {dayExpanded && hiddenCount > 0 && (
                      <button
                        type="button"
                        className="mt-0.5 w-full rounded px-1 py-0.5 text-left text-[10px] text-primary hover:bg-accent"
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
