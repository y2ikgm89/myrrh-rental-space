'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateReservationStatus } from '@/actions/admin/reservation'
import type { CalendarEvent } from '@/lib/calendar'
import type { ReservationStatus } from '@/generated/prisma/client/enums'

export function useEventActions() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setSelectedEvent(null)
  }, [])

  const handleStatusChange = useCallback(
    async (eventId: string, newStatus: ReservationStatus) => {
      // 重複実行を防止
      if (isPending) return

      startTransition(async () => {
        const result = await updateReservationStatus(eventId, newStatus)
        if (result.success) {
          toast.success(result.message || 'ステータスを更新しました')
          router.refresh()
          setSelectedEvent(null)
        } else {
          toast.error(result.error || 'エラーが発生しました')
        }
      })
    },
    [router, isPending]
  )

  return {
    isPending,
    selectedEvent,
    handleEventClick,
    handleCloseDialog,
    handleStatusChange,
  }
}
