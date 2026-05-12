"use client";

import { useCalendarState } from "./hooks/use-calendar-state";
import { useEventActions } from "./hooks/use-event-actions";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthView } from "./views/MonthView";
import { WeekView } from "./views/WeekView";
import { DayView } from "./views/DayView";
import { ResourceView } from "./views/ResourceView";
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

  return (
    <div className="flex h-full flex-col gap-4">
      <CalendarToolbar state={state} />

      <div className="min-h-0 flex-1">
        {view === "month" && (
          <MonthView
            dateRange={dateRange}
            currentDate={currentDate}
            events={optimisticEvents}
            onEventClick={handleEventClick}
            onDayClick={goToDate}
          />
        )}
        {view === "week" && (
          <WeekView
            dateRange={dateRange}
            events={optimisticEvents}
            onEventClick={handleEventClick}
          />
        )}
        {view === "day" && (
          <DayView
            date={currentDate}
            events={optimisticEvents}
            onEventClick={handleEventClick}
          />
        )}
        {view === "resource" && (
          <ResourceView
            date={currentDate}
            events={optimisticEvents}
            spaces={state.spaces}
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
