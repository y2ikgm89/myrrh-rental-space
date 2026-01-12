'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateReservationStatus } from '@/actions/admin/reservation'
import type { CalendarEvent } from '@/lib/calendar'
import type { ReservationStatus } from '@/generated/prisma/client/enums'

type OptimisticAction = {
  type: 'UPDATE_STATUS'
  eventId: string
  newStatus: ReservationStatus
}

function eventsReducer(
  events: CalendarEvent[],
  action: OptimisticAction
): CalendarEvent[] {
  switch (action.type) {
    case 'UPDATE_STATUS':
      return events.map((event) =>
        event.id === action.eventId
          ? { ...event, status: action.newStatus }
          : event
      )
    default:
      return events
  }
}

interface UseEventActionsOptions {
  events: CalendarEvent[]
}

export function useEventActions({ events }: UseEventActionsOptions) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticEvents, setOptimisticEvents] = useOptimistic(
    events,
    eventsReducer
  )
  const [selectedEvent, setSelectedEventState] = useOptimistic<CalendarEvent | null, CalendarEvent | null>(
    null,
    (_, newEvent) => newEvent
  )

  const handleEventClick = (event: CalendarEvent) => {
    // 楽観的更新されたイベントを取得
    const optimisticEvent = optimisticEvents.find((e) => e.id === event.id)
    setSelectedEventState(optimisticEvent || event)
  }

  const handleCloseDialog = () => {
    setSelectedEventState(null)
  }

  const handleStatusChange = async (
    eventId: string,
    newStatus: ReservationStatus
  ) => {
    // 重複実行を防止
    if (isPending) return

    startTransition(async () => {
      // 楽観的にUIを更新
      setOptimisticEvents({
        type: 'UPDATE_STATUS',
        eventId,
        newStatus,
      })

      // 選択中のイベントも楽観的に更新
      if (selectedEvent?.id === eventId) {
        setSelectedEventState({ ...selectedEvent, status: newStatus })
      }

      const result = await updateReservationStatus(eventId, newStatus)
      if (result.success) {
        toast.success(result.message || 'ステータスを更新しました')
        router.refresh()
        setSelectedEventState(null)
      } else {
        toast.error(result.error || 'エラーが発生しました')
        // エラー時はrouter.refresh()でサーバーの状態にロールバック
        router.refresh()
      }
    })
  }

  return {
    isPending,
    optimisticEvents,
    selectedEvent,
    handleEventClick,
    handleCloseDialog,
    handleStatusChange,
  }
}
