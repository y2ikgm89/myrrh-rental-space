'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Button,
  DataTable,
  DataTableColumnHeader,
  type ColumnDef,
} from '@/components/admin/ui'
import { CustomerStatusBadge } from '@/components/admin/status-badges'
import type { CustomerData } from '@/actions/admin/customer'

// =============================================================================
// Types
// =============================================================================

type CustomerTableProps = {
  customers: CustomerData[]
}

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<CustomerData>[] = [
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => <CustomerStatusBadge status={row.getValue('status')} />,
    enableSorting: false,
  },
  {
    id: 'name',
    accessorFn: (row) => `${row.lastName} ${row.firstName}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="お名前" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.lastName} {row.original.firstName}
      </span>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="メールアドレス" />
    ),
    cell: ({ row }) => (
      <a
        href={`mailto:${row.getValue('email')}`}
        className="text-primary hover:underline"
      >
        {row.getValue('email')}
      </a>
    ),
  },
  {
    accessorKey: 'phoneNumber',
    header: '電話番号',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue('phoneNumber') || '-'}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'totalReservations',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="予約数" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue<number>('totalReservations')}
      </span>
    ),
  },
  {
    accessorKey: 'lastReservationAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="最終予約" />
    ),
    cell: ({ row }) => {
      const lastReservationAt = row.getValue<string | null>('lastReservationAt')
      return (
        <span className="text-muted-foreground">
          {lastReservationAt
            ? format(new Date(lastReservationAt), 'yyyy/MM/dd', { locale: ja })
            : '-'}
        </span>
      )
    },
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => (
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/customers/${row.original.id}`}>詳細</Link>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
]

// =============================================================================
// CustomerTable Component
// =============================================================================

export function CustomerTable({ customers }: CustomerTableProps) {
  const memoizedColumns = useMemo(() => columns, [])

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">顧客がいません</p>
      </div>
    )
  }

  return (
    <DataTable
      columns={memoizedColumns}
      data={customers}
      filterColumn="name"
      filterPlaceholder="名前で検索..."
      emptyMessage="顧客がいません"
      initialSorting={[{ id: 'lastReservationAt', desc: true }]}
    />
  )
}
