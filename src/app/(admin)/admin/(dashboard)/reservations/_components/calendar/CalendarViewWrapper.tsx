"use client";

import { useCalendarState, useEventActions } from "./hooks";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthView, WeekView, DayView } from "./views";
import { EventDetailDialog } from "./EventDetailDialog";
import type { CalendarEvent, SpaceOption } from "@/admin/lib/calendar";

interface CalendarViewWrapperProps {
  initialEvents: CalendarEvent[];
  spaces: SpaceOption[];
}

export function CalendarViewWrapper({
  initialEvents,
  spaces,
}: CalendarViewWrapperProps) {
  const state = useCalendarState({ events: initialEvents, spaces });
  const {
    isPending,
    optimisticEvents,
    selectedEvent,
    handleEventClick,
    handleCloseDialog,
    handleStatusChange,
  } = useEventActions({ events: state.events });

  const { view, currentDate, dateRange, goToDate } = state;

  // 楽観的更新されたイベントをフィルタリング（useCalendarStateのフィルター条件を適用済み）
  // state.eventsはすでにフィルター済みなので、optimisticEventsも同じイベントIDでフィルタリング
  const filteredOptimisticEvents = optimisticEvents;

  return (
    <div className="flex h-full flex-col space-y-4">
      <CalendarToolbar state={state} />

      <div className="min-h-0 flex-1">
        {view === "month" && (
          <MonthView
            dateRange={dateRange}
            currentDate={currentDate}
            events={filteredOptimisticEvents}
            onEventClick={handleEventClick}
            onDayClick={goToDate}
          />
        )}
        {view === "week" && (
          <WeekView
            dateRange={dateRange}
            events={filteredOptimisticEvents}
            onEventClick={handleEventClick}
          />
        )}
        {view === "day" && (
          <DayView
            date={currentDate}
            events={filteredOptimisticEvents}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      <EventDetailDialog
        event={selectedEvent}
        isPending={isPending}
        onClose={handleCloseDialog}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
