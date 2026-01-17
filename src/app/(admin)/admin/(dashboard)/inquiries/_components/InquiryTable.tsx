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
import { InquiryStatusBadge } from '@/components/admin/status-badges'
import type { InquiryData } from '@/actions/admin/inquiry'

// =============================================================================
// Types
// =============================================================================

type InquiryTableProps = {
  inquiries: InquiryData[]
}

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<InquiryData>[] = [
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => <InquiryStatusBadge status={row.getValue('status')} />,
    enableSorting: false,
  },
  {
    accessorKey: 'subject',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="件名" />
    ),
    cell: ({ row }) => (
      <div className="max-w-xs truncate font-medium">
        {row.getValue('subject')}
      </div>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="お名前" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue('name')}</span>
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
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="受付日時" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {format(new Date(row.getValue('createdAt')), 'yyyy/MM/dd HH:mm', {
          locale: ja,
        })}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => (
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/inquiries/${row.original.id}`}>詳細</Link>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
]

// =============================================================================
// InquiryTable Component
// =============================================================================

export function InquiryTable({ inquiries }: InquiryTableProps) {
  const memoizedColumns = useMemo(() => columns, [])

  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">お問い合わせがありません</p>
      </div>
    )
  }

  return (
    <DataTable
      columns={memoizedColumns}
      data={inquiries}
      filterColumn="subject"
      filterPlaceholder="件名で検索..."
      emptyMessage="お問い合わせがありません"
      initialSorting={[{ id: 'createdAt', desc: true }]}
    />
  )
}
