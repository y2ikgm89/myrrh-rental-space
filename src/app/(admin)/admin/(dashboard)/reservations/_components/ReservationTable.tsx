'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui'
import { ReservationStatusBadge } from '@/components/admin/status-badges'
import { updateReservationStatus } from '@/actions/admin/reservation'
import type { ReservationWithRelations } from '@/actions/admin/reservation'
import {
  isValidReservationStatus,
  type ReservationStatus,
} from '@/lib/validations/enums'

type ReservationTableProps = {
  reservations: ReservationWithRelations[]
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(new Date(date))
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatPrice(price: number | null): string {
  if (price === null) return '-'
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(price)
}

function StatusSelect({
  reservationId,
  currentStatus,
}: {
  reservationId: string
  currentStatus: ReservationStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleStatusChange = async (newStatus: ReservationStatus) => {
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

export function ReservationTable({ reservations }: ReservationTableProps) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">予約がありません</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>予約日時</TableHead>
            <TableHead>スペース</TableHead>
            <TableHead>顧客</TableHead>
            <TableHead>料金</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.map((reservation) => (
            <TableRow key={reservation.id}>
              <TableCell>
                <div className="font-medium">
                  {formatDate(reservation.startTime)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatTime(reservation.startTime)} -{' '}
                  {formatTime(reservation.endTime)}
                </div>
              </TableCell>
              <TableCell>{reservation.space.name}</TableCell>
              <TableCell>
                <div className="font-medium">
                  {reservation.customer.lastName} {reservation.customer.firstName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {reservation.customer.email}
                </div>
              </TableCell>
              <TableCell>{formatPrice(reservation.totalPrice)}</TableCell>
              <TableCell>
                <ReservationStatusBadge status={reservation.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <StatusSelect
                    reservationId={reservation.id}
                    currentStatus={reservation.status}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/reservations/${reservation.id}`}>
                      詳細
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
