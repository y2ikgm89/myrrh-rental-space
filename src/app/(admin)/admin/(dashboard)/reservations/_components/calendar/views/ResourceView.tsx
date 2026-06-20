"use client";

import { isSameDay } from "date-fns";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
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
 * 2D グリッド本体は WeekView / DayView と同じ `TimeGrid` shell を共有する。
 * 列ヘッダーはスペース名（日付ベースの「今日」ハイライトは適用しない — date は
 * Toolbar が SSoT）。
 */
export function ResourceView({
  date,
  events,
  spaces,
  onEventClick,
}: ResourceViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const gridHeight = timeSlots.length * PIXELS_PER_HOUR;

  const dayEvents = events.filter((e) =>
    isSameDay(new Date(e.startTime), date),
  );

  // 該当スペースに属さない予約 (削除済みスペース等のフォールバック)
  const orphanEvents = dayEvents.filter(
    (e) => !spaces.some((s) => s.id === e.spaceId),
  );

  if (spaces.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border bg-card">
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <TimeGrid
        timeSlots={timeSlots}
        gridHeight={gridHeight}
        columns={columns}
      />

      {/* 孤立イベント (削除済みスペース等のフォールバック) — カード内の status footer */}
      {orphanEvents.length > 0 && (
        <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {orphanEvents.length}{" "}
          件の予約は削除済みスペースに紐づくため表示されていません。
        </div>
      )}
    </div>
  );
}
