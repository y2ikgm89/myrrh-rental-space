'use client'

import { format, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { cn } from '@/shared/lib/utils'
import {
  generateTimeSlots,
  layoutOverlappingEvents,
  getWeekdayColorClass,
  DEFAULT_BUSINESS_HOURS,
  PIXELS_PER_HOUR,
} from '@/admin/lib/calendar'
import type { CalendarEvent } from '@/admin/lib/calendar'
import { EventCell } from '../EventCell'
import { TimeColumn } from './TimeColumn'

interface DayViewProps {
  date: Date
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
}

export function DayView({ date, events, onEventClick }: DayViewProps) {
  // React Compilerが自動メモ化
  const timeSlots = generateTimeSlots(DEFAULT_BUSINESS_HOURS)

  // イベント配置計算（React Compilerが自動メモ化）
  const positionedEvents = layoutOverlappingEvents(events)

  const gridHeight = timeSlots.length * PIXELS_PER_HOUR
  const dayOfWeek = date.getDay()

  return (
    <div className="flex h-full flex-col rounded-lg border bg-white">
      {/* ヘッダー */}
      <div className="grid grid-cols-[60px_1fr] border-b bg-gray-50">
        <div className="border-r p-2" />
        <div
          className={cn(
            'p-4 text-center',
            isToday(date) && 'bg-primary/5'
          )}
        >
          <div
            className={cn(
              'text-sm font-medium',
              getWeekdayColorClass(dayOfWeek)
            )}
          >
            {format(date, 'E', { locale: ja })}
          </div>
          <div
            className={cn(
              'mt-1 inline-flex h-10 w-10 items-center justify-center text-2xl',
              isToday(date) &&
                'rounded-full bg-primary text-primary-foreground'
            )}
          >
            {format(date, 'd')}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {format(date, 'yyyy年M月', { locale: ja })}
          </div>
        </div>
      </div>

      {/* グリッド */}
      <div className="flex-1 overflow-auto">
        <div
          className="relative grid grid-cols-[60px_1fr]"
          style={{ height: `${gridHeight}px` }}
        >
          <TimeColumn timeSlots={timeSlots} />

          {/* 日列 */}
          <div
            className={cn(
              'relative',
              isToday(date) && 'bg-primary/5'
            )}
          >
            {/* 背景グリッド */}
            {timeSlots.map((time) => (
              <div key={time} className="h-[60px] border-b" />
            ))}

            {/* イベント */}
            <div className="absolute inset-0 px-2">
              {positionedEvents.map((event) => (
                <EventCell
                  key={event.id}
                  event={event}
                  onClick={onEventClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* イベントがない場合 */}
      {events.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">この日の予約はありません</p>
        </div>
      )}
    </div>
  )
}
