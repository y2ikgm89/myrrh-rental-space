'use client'

import { useCalendarState, useEventActions } from './hooks'
import { CalendarToolbar } from './CalendarToolbar'
import { MonthView, WeekView, DayView } from './views'
import { EventDetailDialog } from './EventDetailDialog'
import type { CalendarEvent, SpaceOption } from '@/lib/calendar'

interface CalendarViewWrapperProps {
  initialEvents: CalendarEvent[]
  spaces: SpaceOption[]
}

export function CalendarViewWrapper({
  initialEvents,
  spaces,
}: CalendarViewWrapperProps) {
  const state = useCalendarState({ events: initialEvents, spaces })
  const {
    isPending,
    selectedEvent,
    handleEventClick,
    handleCloseDialog,
    handleStatusChange,
  } = useEventActions()

  const { view, currentDate, dateRange, events, goToDate } = state

  return (
    <div className="flex h-full flex-col space-y-4">
      <CalendarToolbar state={state} />

      <div className="min-h-0 flex-1">
        {view === 'month' && (
          <MonthView
            dateRange={dateRange}
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onDayClick={goToDate}
          />
        )}
        {view === 'week' && (
          <WeekView
            dateRange={dateRange}
            events={events}
            onEventClick={handleEventClick}
          />
        )}
        {view === 'day' && (
          <DayView
            date={currentDate}
            events={events}
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
  )
}
