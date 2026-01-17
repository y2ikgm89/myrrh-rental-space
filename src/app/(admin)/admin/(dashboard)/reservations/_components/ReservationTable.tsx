'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Button,
  DataTable,
  DataTableColumnHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from '@/components/admin/ui'
import { ReservationStatusBadge } from '@/components/admin/status-badges'
import { updateReservationStatus } from '@/actions/admin/reservation'
import type { ReservationWithRelations } from '@/actions/admin/reservation'
import {
  isValidReservationStatus,
  type ReservationStatus,
} from '@/lib/validations/enums'

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
// Cell Components
// =============================================================================

function StatusSelect({
  reservationId,
  currentStatus,
}: {
  reservationId: string
  currentStatus: ReservationStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleStatusChange = useCallback(
    (newStatus: ReservationStatus) => {
      if (newStatus === currentStatus) return

      startTransition(async () => {
        const result = await updateReservationStatus(reservationId, newStatus)
        if (result.success) {
          router.refresh()
        } else {
          toast.error(result.error || 'エラーが発生しました')
        }
      })
    },
    [reservationId, currentStatus, router]
  )

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

function ActionCell({ reservation }: { reservation: ReservationWithRelations }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <StatusSelect
        reservationId={reservation.id}
        currentStatus={reservation.status}
      />
      <Button variant="outline" size="sm" asChild>
        <Link href={`/admin/reservations/${reservation.id}`}>詳細</Link>
      </Button>
    </div>
  )
}

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<ReservationWithRelations>[] = [
  {
    id: 'datetime',
    accessorFn: (row) => row.startTime,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="予約日時" />
    ),
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{formatDate(row.original.startTime)}</div>
        <div className="text-sm text-muted-foreground">
          {formatTime(row.original.startTime)} - {formatTime(row.original.endTime)}
        </div>
      </div>
    ),
  },
  {
    id: 'space',
    accessorFn: (row) => row.space.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="スペース" />
    ),
    cell: ({ row }) => <span>{row.original.space.name}</span>,
  },
  {
    id: 'customer',
    accessorFn: (row) => `${row.customer.lastName} ${row.customer.firstName}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="顧客" />
    ),
    cell: ({ row }) => (
      <div>
        <div className="font-medium">
          {row.original.customer.lastName} {row.original.customer.firstName}
        </div>
        <div className="text-sm text-muted-foreground">
          {row.original.customer.email}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'totalPrice',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="料金" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">{formatPrice(row.getValue('totalPrice'))}</div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => <ReservationStatusBadge status={row.getValue('status')} />,
    enableSorting: false,
  },
  {
    id: 'actions',
    header: () => <div className="text-right">操作</div>,
    cell: ({ row }) => <ActionCell reservation={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
]

// =============================================================================
// ReservationTable Component
// =============================================================================

export function ReservationTable({ reservations }: ReservationTableProps) {
  const memoizedColumns = useMemo(() => columns, [])

  if (reservations.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">予約がありません</p>
      </div>
    )
  }

  return (
    <DataTable
      columns={memoizedColumns}
      data={reservations}
      filterColumn="customer"
      filterPlaceholder="顧客名で検索..."
      emptyMessage="予約がありません"
      initialSorting={[{ id: 'datetime', desc: true }]}
    />
  )
}
