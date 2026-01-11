'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import type { CalendarView, CalendarEvent, SpaceOption } from '@/lib/calendar'
import {
  getCalendarDateRange,
  navigateNext,
  navigatePrevious,
  getEventsForDay,
} from '@/lib/calendar'
import type { ReservationStatus } from '@/generated/prisma/client/enums'

interface UseCalendarStateOptions {
  events: CalendarEvent[]
  spaces: SpaceOption[]
}

export function useCalendarState({ events, spaces }: UseCalendarStateOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL State から読み取り
  const view = (searchParams.get('view') as CalendarView) || 'week'
  const dateParam = searchParams.get('date')
  const spaceId = searchParams.get('spaceId') || undefined
  const status = (searchParams.get('status') as ReservationStatus | 'ALL') || 'ALL'

  // 日付をuseMemoでラップ
  const currentDate = useMemo(
    () => (dateParam ? new Date(dateParam) : new Date()),
    [dateParam]
  )

  // 日付範囲計算
  const dateRange = useMemo(
    () => getCalendarDateRange(currentDate, view),
    [currentDate, view]
  )

  // フィルタリング済みイベント
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (spaceId && event.spaceId !== spaceId) return false
      if (status !== 'ALL' && event.status !== status) return false
      return true
    })
  }, [events, spaceId, status])

  // URL更新ヘルパー
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // ビュー切り替え
  const setView = useCallback(
    (newView: CalendarView) => {
      updateParams({ view: newView })
    },
    [updateParams]
  )

  // 日付ナビゲーション
  const goNext = useCallback(() => {
    const nextDate = navigateNext(currentDate, view)
    updateParams({ date: format(nextDate, 'yyyy-MM-dd') })
  }, [currentDate, view, updateParams])

  const goPrevious = useCallback(() => {
    const prevDate = navigatePrevious(currentDate, view)
    updateParams({ date: format(prevDate, 'yyyy-MM-dd') })
  }, [currentDate, view, updateParams])

  const goToday = useCallback(() => {
    updateParams({ date: null })
  }, [updateParams])

  const goToDate = useCallback(
    (date: Date) => {
      updateParams({ date: format(date, 'yyyy-MM-dd') })
    },
    [updateParams]
  )

  // フィルター変更
  const setSpaceFilter = useCallback(
    (id: string | null) => {
      updateParams({ spaceId: id })
    },
    [updateParams]
  )

  const setStatusFilter = useCallback(
    (newStatus: ReservationStatus | 'ALL' | null) => {
      updateParams({ status: newStatus === 'ALL' ? null : newStatus })
    },
    [updateParams]
  )

  // 日別イベント取得
  const getEventsForDayMemo = useCallback(
    (day: Date) => getEventsForDay(filteredEvents, day),
    [filteredEvents]
  )

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
    getEventsForDay: getEventsForDayMemo,
  }
}

export type CalendarState = ReturnType<typeof useCalendarState>
