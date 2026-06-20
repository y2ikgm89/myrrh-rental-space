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
import { TimeGrid, type TimeGridColumn } from "./TimeGrid";

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
 *
 * 2D グリッド本体は WeekView と同じ `TimeGrid` shell を共有する。
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

  // 当日のイベントのみフィルタ
  const dayEvents = events.filter((e) =>
    isSameDay(new Date(e.startTime), date),
  );

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

  const columns: TimeGridColumn[] = spaces.map((space) => {
    const spaceEvents = layoutOverlappingEvents(
      dayEvents.filter((e) => e.spaceId === space.id),
    );
    return {
      key: space.id,
      minWidthPx: MIN_COLUMN_WIDTH,
      header: (
        <div
          className="flex h-full items-center truncate px-3 py-2 text-sm font-semibold"
          title={space.name}
        >
          {space.name}
        </div>
      ),
      body: (
        <div className="absolute inset-0 px-1">
          {spaceEvents.map((event) => (
            <EventCell key={event.id} event={event} onClick={onEventClick} />
          ))}
        </div>
      ),
    };
  });

  return (
    <div className="flex h-full flex-col gap-2">
      {/* 日付ヘッダー (TimeGrid の外側 — 固定タイトル領域) */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
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

      {/* スペース別タイムグリッド本体 */}
      <div className="min-h-0 flex-1">
        <TimeGrid
          timeSlots={timeSlots}
          gridHeight={gridHeight}
          columns={columns}
        />
      </div>

      {/* 孤立イベント (削除済みスペース等) */}
      {orphanEvents.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {orphanEvents.length}{" "}
          件の予約は削除済みスペースに紐づくため表示されていません。
        </div>
      )}
    </div>
  );
}
