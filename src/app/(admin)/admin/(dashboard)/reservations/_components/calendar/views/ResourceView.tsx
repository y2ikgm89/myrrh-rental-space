"use client";

import { isToday } from "date-fns";
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  isSameJstDay,
  DEFAULT_BUSINESS_HOURS,
  CALENDAR_LAYOUT,
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
 * 列ヘッダーはスペース名 (列が space ベースなので per-column の今日判定はしない)。
 * date 側の「今日」は全列ボディに `bg-primary/5` tint を一律適用して affordance を与える
 * (Week/Day と整合)。
 */
export function ResourceView({
  date,
  events,
  spaces,
  onEventClick,
}: ResourceViewProps) {
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS);
  const gridHeight = timeSlots.length * CALENDAR_LAYOUT.pixelsPerHour;
  const today = isToday(date);

  const dayEvents = events.filter((e) => isSameJstDay(e.startTime, date));

  // 該当スペースに属さない予約 (削除済みスペース等のフォールバック)
  const orphanEvents = dayEvents.filter(
    (e) => !spaces.some((s) => s.id === e.spaceId),
  );

  // 空状態の外殻も他 3 ビューと同じ baseline shell。中身のセンタリングは
  // inner div で完結させ、outer の shape を統一する。
  if (spaces.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <p className="text-muted-foreground">
            表示できるスペースがありません。スペースを登録してください。
          </p>
        </div>
      </div>
    );
  }

  const columns: TimeGridColumn[] = spaces.map((space) => {
    const spaceEvents = layoutOverlappingEvents(
      dayEvents.filter((e) => e.spaceId === space.id),
    );
    return {
      key: space.id,
      minWidthPx: CALENDAR_LAYOUT.resourceColumnMinPx,
      header: (
        <div
          className="flex h-full items-center truncate px-2 py-2 text-sm font-semibold"
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
      // Today の affordance: 全スペース列のボディに薄い primary tint
      ...(today ? { bodyClassName: "bg-primary/5" } : {}),
    };
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <TimeGrid
        timeSlots={timeSlots}
        gridHeight={gridHeight}
        columns={columns}
        ariaLabel="スペース別予約タイムグリッド"
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
