'use client'

import { useState, type ReactElement } from 'react'
import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/utils'
import { toDateString } from '@/shared/lib/serialize'

const calendarStyles = tv({
  slots: {
    container: 'w-full',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold text-foreground',
    navButton:
      'p-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
    weekdays: 'grid grid-cols-7 gap-1 mb-2',
    weekday: 'text-center text-xs font-medium text-muted-foreground py-2',
    days: 'grid grid-cols-7 gap-1',
    day: [
      'aspect-square flex items-center justify-center rounded-md text-sm transition-colors',
      'hover:bg-muted cursor-pointer',
      'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent',
    ],
    daySelected: 'bg-primary text-primary-foreground hover:bg-primary/90',
    dayToday: 'ring-2 ring-primary ring-offset-2',
    dayOutside: 'text-muted-foreground/50',
  },
})

const {
  container,
  header,
  title,
  navButton,
  weekdays,
  weekday,
  days,
  day,
  daySelected,
  dayToday,
  dayOutside,
} = calendarStyles()

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

interface CalendarProps {
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  minDate?: Date
  disabledDates?: string[] // YYYY-MM-DD 形式
}

export function Calendar({
  selectedDate,
  onSelectDate,
  minDate = new Date(),
  disabledDates = [],
}: CalendarProps): ReactElement {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const today = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const minDateNormalized = (() => {
    const d = new Date(minDate)
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const disabledDateSet = new Set(disabledDates)

  const calendarDays = (() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    // 月の最初の日と最後の日
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // カレンダーの開始日（前月の日を含む）
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())

    // カレンダーの終了日（次月の日を含む）
    const endDate = new Date(lastDay)
    const remainingDays = 6 - lastDay.getDay()
    endDate.setDate(endDate.getDate() + remainingDays)

    const days: Date[] = []
    const current = new Date(startDate)

    while (current <= endDate) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }

    return days
  })()

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const isDateDisabled = (date: Date): boolean => {
    const normalized = new Date(date)
    normalized.setHours(0, 0, 0, 0)

    // 過去の日付は無効
    if (normalized < minDateNormalized) {
      return true
    }

    // 明示的に無効化された日付
    const dateStr = toDateString(normalized)
    if (disabledDateSet.has(dateStr)) {
      return true
    }

    return false
  }

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentMonth.getMonth()
  }

  const isToday = (date: Date): boolean => {
    return date.getTime() === today.getTime()
  }

  const isSelected = (date: Date): boolean => {
    if (!selectedDate) return false
    const normalizedSelected = new Date(selectedDate)
    normalizedSelected.setHours(0, 0, 0, 0)
    const normalizedDate = new Date(date)
    normalizedDate.setHours(0, 0, 0, 0)
    return normalizedSelected.getTime() === normalizedDate.getTime()
  }

  const canGoPrev = (() => {
    const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    const lastDayOfPrevMonth = new Date(
      prevMonth.getFullYear(),
      prevMonth.getMonth() + 1,
      0
    )
    return lastDayOfPrevMonth >= minDateNormalized
  })()

  const formatMonthYear = (date: Date): string => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`
  }

  return (
    <div className={container()}>
      {/* ヘッダー */}
      <div className={header()}>
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={!canGoPrev}
          className={navButton()}
          aria-label="前月へ"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <h3 className={title()}>{formatMonthYear(currentMonth)}</h3>

        <button
          type="button"
          onClick={handleNextMonth}
          className={navButton()}
          aria-label="次月へ"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* 曜日ヘッダー */}
      <div className={weekdays()}>
        {WEEKDAYS.map((dayName, index) => (
          <div
            key={dayName}
            className={cn(
              weekday(),
              index === 0 && 'text-red-500',
              index === 6 && 'text-blue-500'
            )}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className={days()}>
        {calendarDays.map((date, index) => {
          const disabled = isDateDisabled(date)
          const outside = !isCurrentMonth(date)
          const selected = isSelected(date)
          const isTodayDate = isToday(date)

          return (
            <button
              key={index}
              type="button"
              onClick={() => !disabled && !outside && onSelectDate(date)}
              disabled={disabled || outside}
              className={cn(
                day(),
                selected && daySelected(),
                isTodayDate && !selected && dayToday(),
                outside && dayOutside()
              )}
              aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}
              aria-pressed={selected}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
