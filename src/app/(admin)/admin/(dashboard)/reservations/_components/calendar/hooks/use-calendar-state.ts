'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import type { CalendarView, CalendarEvent, SpaceOption } from '@/admin/lib/calendar'
import {
  getCalendarDateRange,
  navigateNext,
  navigatePrevious,
  getEventsForDay,
  getValidCalendarView,
} from '@/admin/lib/calendar'
import { getReservationStatusFilterOrAll } from '@/shared/lib/validations/enums'
import type { ReservationStatus } from '@/shared/generated/prisma/enums'

interface UseCalendarStateOptions {
  events: CalendarEvent[]
  spaces: SpaceOption[]
}

export function useCalendarState({ events, spaces }: UseCalendarStateOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL State から読み取り
  const view = getValidCalendarView(searchParams.get('view'), 'week')
  const dateParam = searchParams.get('date')
  const spaceId = searchParams.get('spaceId') || undefined
  const status = getReservationStatusFilterOrAll(searchParams.get('status'))

  // 日付計算（new Date()の参照安定化のためuseMemo維持）
  const currentDate = useMemo(
    () => (dateParam ? new Date(dateParam) : new Date()),
    [dateParam]
  )

  // 日付範囲計算
  const dateRange = getCalendarDateRange(currentDate, view)

  // フィルタリング済みイベント
  const filteredEvents = events.filter((event) => {
    if (spaceId && event.spaceId !== spaceId) return false
    if (status !== 'ALL' && event.status !== status) return false
    return true
  })

  // URL更新ヘルパー
  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    router.push(`?${params.toString()}`, { scroll: false })
  }

  // ビュー切り替え
  const setView = (newView: CalendarView) => {
    updateParams({ view: newView })
  }

  // 日付ナビゲーション
  const goNext = () => {
    const nextDate = navigateNext(currentDate, view)
    updateParams({ date: format(nextDate, 'yyyy-MM-dd') })
  }

  const goPrevious = () => {
    const prevDate = navigatePrevious(currentDate, view)
    updateParams({ date: format(prevDate, 'yyyy-MM-dd') })
  }

  const goToday = () => {
    updateParams({ date: null })
  }

  const goToDate = (date: Date) => {
    updateParams({ date: format(date, 'yyyy-MM-dd') })
  }

  // フィルター変更
  const setSpaceFilter = (id: string | null) => {
    updateParams({ spaceId: id })
  }

  const setStatusFilter = (newStatus: ReservationStatus | 'ALL' | null) => {
    updateParams({ status: newStatus === 'ALL' ? null : newStatus })
  }

  // 日別イベント取得
  const getEventsForDayFn = (day: Date) => getEventsForDay(filteredEvents, day)

  return {
    // State
    view,
    currentDate,
    dateRange,
    spaceId,
    status,
    spaces,
    events: filteredEvents,

    // Actions
    setView,
    goNext,
    goPrevious,
    goToday,
    goToDate,
    setSpaceFilter,
    setStatusFilter,
    getEventsForDay: getEventsForDayFn,
  }
}

export type CalendarState = ReturnType<typeof useCalendarState>
