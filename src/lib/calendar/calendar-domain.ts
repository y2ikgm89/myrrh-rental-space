import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  isSameDay,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  format,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import type {
  CalendarView,
  CalendarDateRange,
  CalendarEvent,
  EventPosition,
  PositionedEvent,
  BusinessHours,
} from './calendar-types'
import { DEFAULT_BUSINESS_HOURS, PIXELS_PER_HOUR } from './calendar-types'

/**
 * カレンダー日付範囲を計算
 */
export function getCalendarDateRange(
  date: Date,
  view: CalendarView
): CalendarDateRange {
  let start: Date
  let end: Date

  switch (view) {
    case 'month': {
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      start = startOfWeek(monthStart, { weekStartsOn: 0 })
      end = endOfWeek(monthEnd, { weekStartsOn: 0 })
      break
    }
    case 'week': {
      start = startOfWeek(date, { weekStartsOn: 0 })
      end = endOfWeek(date, { weekStartsOn: 0 })
      break
    }
    case 'day': {
      start = startOfDay(date)
      end = endOfDay(date)
      break
    }
  }

  const displayDates = eachDayOfInterval({ start, end })

  return { start, end, displayDates }
}

/**
 * 日付ナビゲーション: 次へ
 */
export function navigateNext(date: Date, view: CalendarView): Date {
  switch (view) {
    case 'month':
      return addMonths(date, 1)
    case 'week':
      return addWeeks(date, 1)
    case 'day':
      return addDays(date, 1)
  }
}

/**
 * 日付ナビゲーション: 前へ
 */
export function navigatePrevious(date: Date, view: CalendarView): Date {
  switch (view) {
    case 'month':
      return subMonths(date, 1)
    case 'week':
      return subWeeks(date, 1)
    case 'day':
      return subDays(date, 1)
  }
}

/**
 * 営業時間の時間枠を生成
 */
export function generateTimeSlots(
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  intervalMinutes: number = 60
): string[] {
  const slots: string[] = []
  const totalMinutes = (hours.endHour - hours.startHour) * 60

  for (let min = 0; min < totalMinutes; min += intervalMinutes) {
    const hour = hours.startHour + Math.floor(min / 60)
    const minute = min % 60
    slots.push(
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    )
  }

  return slots
}

/**
 * イベントのグリッド位置を計算
 */
export function calculateEventPosition(
  event: CalendarEvent,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  pixelsPerHour: number = PIXELS_PER_HOUR
): EventPosition {
  const startMinutes =
    event.startTime.getHours() * 60 + event.startTime.getMinutes()
  const endMinutes = event.endTime.getHours() * 60 + event.endTime.getMinutes()
  const dayStartMinutes = hours.startHour * 60
  const dayEndMinutes = hours.endHour * 60

  // 範囲外クリッピング
  const clippedStart = Math.max(startMinutes, dayStartMinutes)
  const clippedEnd = Math.min(endMinutes, dayEndMinutes)

  const duration = Math.max(0, clippedEnd - clippedStart)
  const offset = Math.max(0, clippedStart - dayStartMinutes)

  return {
    top: (offset / 60) * pixelsPerHour,
    height: Math.max((duration / 60) * pixelsPerHour, 20), // 最小高さ20px
    left: 0,
    width: 100,
    zIndex: 1,
  }
}

/**
 * 重複イベントの配置を調整
 */
export function layoutOverlappingEvents(
  events: CalendarEvent[],
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  pixelsPerHour: number = PIXELS_PER_HOUR
): PositionedEvent[] {
  if (events.length === 0) return []

  // 開始時間でソート
  const sorted = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  )

  // 重複グループを検出
  const groups: CalendarEvent[][] = []
  let currentGroup: CalendarEvent[] = []

  for (const event of sorted) {
    if (currentGroup.length === 0) {
      currentGroup.push(event)
      continue
    }

    // 現在のグループと重複するか確認
    const hasOverlap = currentGroup.some(
      (e) => e.startTime < event.endTime && event.startTime < e.endTime
    )

    if (hasOverlap) {
      currentGroup.push(event)
    } else {
      groups.push(currentGroup)
      currentGroup = [event]
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  // 各グループ内でカラム配置
  const result: PositionedEvent[] = []

  for (const group of groups) {
    const columns: CalendarEvent[][] = []

    for (const event of group) {
      let placed = false

      for (const column of columns) {
        const lastInColumn = column[column.length - 1]
        if (lastInColumn.endTime <= event.startTime) {
          column.push(event)
          placed = true
          break
        }
      }

      if (!placed) {
        columns.push([event])
      }
    }

    const columnCount = columns.length
    const columnWidth = 100 / columnCount

    columns.forEach((column, colIndex) => {
      for (const event of column) {
        const position = calculateEventPosition(event, hours, pixelsPerHour)
        result.push({
          ...event,
          position: {
            ...position,
            left: colIndex * columnWidth,
            width: columnWidth - 1, // 1%のマージン
            zIndex: colIndex + 1,
          },
        })
      }
    })
  }

  return result
}

/**
 * 指定日のイベントを取得
 */
export function getEventsForDay(
  events: CalendarEvent[],
  day: Date
): CalendarEvent[] {
  return events.filter((event) => isSameDay(event.startTime, day))
}

/**
 * ステータス別色クラスを取得
 */
export function getStatusColorClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 border-l-yellow-500 text-yellow-800'
    case 'CONFIRMED':
      return 'bg-green-100 border-l-green-500 text-green-800'
    case 'CANCELLED':
      return 'bg-gray-100 border-l-gray-400 text-gray-500 line-through'
    default:
      return 'bg-blue-100 border-l-blue-500 text-blue-800'
  }
}

/**
 * スペース別色クラスを取得（ハッシュベース）
 */
export function getSpaceColorClass(spaceId: string, index?: number): string {
  const colors = [
    'border-l-blue-500',
    'border-l-purple-500',
    'border-l-pink-500',
    'border-l-indigo-500',
    'border-l-teal-500',
    'border-l-orange-500',
    'border-l-cyan-500',
    'border-l-rose-500',
  ]

  if (index !== undefined) {
    return colors[index % colors.length]
  }

  const hash = spaceId
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

/**
 * 日付ラベルをフォーマット
 */
export function formatDateLabel(date: Date, view: CalendarView): string {
  switch (view) {
    case 'month':
      return format(date, 'yyyy年M月', { locale: ja })
    case 'week': {
      const weekStart = startOfWeek(date, { weekStartsOn: 0 })
      const weekEnd = endOfWeek(date, { weekStartsOn: 0 })
      return `${format(weekStart, 'M月d日', { locale: ja })} - ${format(weekEnd, 'M月d日', { locale: ja })}`
    }
    case 'day':
      return format(date, 'yyyy年M月d日 (E)', { locale: ja })
  }
}

/**
 * 曜日ヘッダーを生成
 */
export function getWeekdayHeaders(): string[] {
  return ['日', '月', '火', '水', '木', '金', '土']
}

/**
 * 曜日の色クラスを取得
 */
export function getWeekdayColorClass(dayIndex: number): string {
  if (dayIndex === 0) return 'text-red-500' // 日曜
  if (dayIndex === 6) return 'text-blue-500' // 土曜
  return ''
}
