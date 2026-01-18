'use client'

import { format } from 'date-fns'
import { cn } from '@/shared/lib/utils'
import { getStatusColorClass } from '@/admin/lib/calendar'
import type { CalendarEvent, PositionedEvent } from '@/admin/lib/calendar'

interface EventCellProps {
  event: PositionedEvent
  onClick: (event: CalendarEvent) => void
}

export function EventCell({ event, onClick }: EventCellProps) {
  const { position } = event

  return (
    <button
      type="button"
      className={cn(
        'absolute overflow-hidden rounded border-l-4 px-2 py-1 text-left text-xs transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
        getStatusColorClass(event.status)
      )}
      style={{
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: `${position.left}%`,
        width: `${position.width}%`,
        zIndex: position.zIndex,
      }}
      onClick={() => onClick(event)}
    >
      <div className="truncate font-medium">{event.title}</div>
      <div className="truncate text-[10px] opacity-75">
        {format(event.startTime, 'HH:mm')} - {format(event.endTime, 'HH:mm')}
      </div>
      {position.height >= 50 && (
        <div className="truncate text-[10px] opacity-75">{event.spaceName}</div>
      )}
    </button>
  )
}

interface EventBadgeProps {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
}

export function EventBadge({ event, onClick }: EventBadgeProps) {
  return (
    <button
      type="button"
      className={cn(
        'mb-0.5 w-full truncate rounded px-1 py-0.5 text-left text-[10px] transition-shadow hover:shadow-sm focus:outline-none focus:ring-1 focus:ring-primary',
        getStatusColorClass(event.status)
      )}
      onClick={() => onClick(event)}
    >
      <span className="font-medium">
        {format(event.startTime, 'HH:mm')}
      </span>{' '}
      {event.title}
    </button>
  )
}
