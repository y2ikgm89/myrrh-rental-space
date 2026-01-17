'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui'
import { updateReservationStatus } from '@/actions/admin/reservation'
import {
  isValidReservationStatus,
  type ReservationStatus,
} from '@/lib/validations/enums'

type ReservationStatusSelectProps = {
  reservationId: string
  currentStatus: ReservationStatus
}

export function ReservationStatusSelect({
  reservationId,
  currentStatus,
}: ReservationStatusSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleStatusChange = (newStatus: ReservationStatus) => {
    if (newStatus === currentStatus) return

    startTransition(async () => {
      const result = await updateReservationStatus(reservationId, newStatus)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => {
        if (isValidReservationStatus(value)) handleStatusChange(value)
      }}
      disabled={isPending}
    >
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="PENDING">保留中</SelectItem>
        <SelectItem value="CONFIRMED">確認済み</SelectItem>
        <SelectItem value="CANCELLED">キャンセル</SelectItem>
      </SelectContent>
    </Select>
  )
}
