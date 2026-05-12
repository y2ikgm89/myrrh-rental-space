"use client";

import { format, isToday, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/shared/lib/cn";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  getWeekdayColorClass,
  DEFAULT_BUSINESS_HOURS,
  PIXELS_PER_HOUR,
} from "@/admin/lib/calendar";
import type { CalendarEvent, SpaceOption } from "@/admin/lib/calendar";
import { EventCell } from "../EventCell";
import { TimeColumn } from "./TimeColumn";

interface ResourceViewProps {
  date: Date;
  events: CalendarEvent[];
  spaces: SpaceOption[];
  onEventClick: (event: CalendarEvent) => void;
}

const MIN_COLUMN_WIDTH = 160;

/**
 * スペース別ビュー (Resource Timeline)
 *
 * 1日分の予約をスペース別の列で表示する業界標準パターン:
 * - FullCalendar Premium `resourceTimeGrid`
 * - Cal.com / Acuity Scheduling / Cronofy
 * - Google Calendar Resource booking
 *
 * 同じスペースの同時間帯予約は物理的に重ならないため、Week/Day View で
 * 発生する「極細バー化」問題が原理的に発生しない。
 */
export function ResourceView({
  date,
  events,
  spaces,
  onEventClick,
}: ResourceViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;
  const dayOfWeek = date.getDay();

  // 当日のイベントのみフィルタ、スペース別にグルーピング
  const dayEvents = events.filter((e) =>
    isSameDay(new Date(e.startTime), date),
  );
  const eventsBySpace = spaces.map((space) => ({
    space,
    events: layoutOverlappingEvents(
      dayEvents.filter((e) => e.spaceId === space.id),
    ),
  }));

  // 該当スペースに属さない予約 (削除済みスペース等のフォールバック)
  const orphanEvents = dayEvents.filter(
    (e) => !spaces.some((s) => s.id === e.spaceId),
  );

  if (spaces.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border bg-card">
        <p className="text-muted-foreground">
          表示できるスペースがありません。スペースを登録してください。
        </p>
      </div>
    );
  }

  // CSS Grid columns: 時刻カラム (60px) + 各スペース (minmax(160px, 1fr))
  const gridTemplate = `60px repeat(${spaces.length}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`;

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
          {dayEvents.length} 件の予約 · {spaces.length} スペース
        </div>
      </div>

      {/* スペース別グリッド (横スクロール対応) */}
      <div className="flex-1 overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {/* スペースヘッダー行 */}
          <div className="sticky top-0 z-20 border-b border-r bg-card" />
          {spaces.map((space) => (
            <div
              key={space.id}
              className="sticky top-0 z-20 truncate border-b border-r bg-card px-3 py-2 text-sm font-semibold last:border-r-0"
              title={space.name}
            >
              {space.name}
            </div>
          ))}

          {/* グリッド本体: 時刻列 + 各スペース列 */}
          <div
            className="sticky left-0 z-10 border-r bg-card"
            style={{ height: `${gridHeight}px` }}
          >
            <TimeColumn timeSlots={timeSlots} />
          </div>

          {eventsBySpace.map(({ space, events: spaceEvents }) => (
            <div
              key={space.id}
              className="relative border-r last:border-r-0"
              style={{ height: `${gridHeight}px` }}
            >
              {/* 時間帯の罫線 */}
              {timeSlots.map((time) => (
                <div key={time} className="h-[60px] border-b last:border-b-0" />
              ))}

              {/* 当該スペースのイベント */}
              <div className="absolute inset-0 px-1">
                {spaceEvents.map((event) => (
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

      {/* 孤立イベント (削除済みスペース等) */}
      {orphanEvents.length > 0 && (
        <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {orphanEvents.length}{" "}
          件の予約は削除済みスペースに紐づくため表示されていません。
        </div>
      )}
    </div>
  );
}
