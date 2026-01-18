import Link from 'next/link'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'
import { ReservationStatusBadge } from '@/admin/components/status-badges'
import { ReservationStatusSelect } from './ReservationStatusSelect'
import type { ReservationWithRelations } from '@/admin/actions/reservation'

// =============================================================================
// Types
// =============================================================================

type ReservationTableProps = {
  reservations: ReservationWithRelations[]
}

// =============================================================================
// Helper Functions
// =============================================================================

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

// =============================================================================
// ReservationTable Component (Server Component)
// =============================================================================

export function ReservationTable({ reservations }: ReservationTableProps) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">予約がありません</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>予約日時</TableHead>
            <TableHead>スペース</TableHead>
            <TableHead>顧客</TableHead>
            <TableHead className="text-right">料金</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.map((reservation) => (
            <TableRow key={reservation.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{formatDate(reservation.startTime)}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatTime(reservation.startTime)} - {formatTime(reservation.endTime)}
                  </div>
                </div>
              </TableCell>
              <TableCell>{reservation.space.name}</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">
                    {reservation.customer.lastName} {reservation.customer.firstName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {reservation.customer.email}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {formatPrice(reservation.totalPrice)}
              </TableCell>
              <TableCell>
                <ReservationStatusBadge status={reservation.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <ReservationStatusSelect
                    reservationId={reservation.id}
                    currentStatus={reservation.status}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/reservations/${reservation.id}`}>詳細</Link>
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
