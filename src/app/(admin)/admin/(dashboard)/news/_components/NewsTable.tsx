'use client'

import Link from 'next/link'
import { useTransition, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type ColumnDef,
} from '@/components/admin/ui'
import { NewsStatusBadge } from '@/components/admin/status-badges'
import { publishNews, unpublishNews } from '@/actions/admin/news'
import type { NewsData } from '@/actions/admin/news'
import { NewsStatus } from '@/generated/prisma/client/enums'

// =============================================================================
// Types
// =============================================================================

type NewsTableProps = {
  news: NewsData[]
}

// =============================================================================
// Action Cell Component
// =============================================================================

function ActionCell({ item }: { item: NewsData }) {
  const [isPending, startTransition] = useTransition()

  const handlePublish = useCallback(() => {
    startTransition(async () => {
      const result = await publishNews(item.id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }, [item.id])

  const handleUnpublish = useCallback(() => {
    startTransition(async () => {
      const result = await unpublishNews(item.id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }, [item.id])

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/news/${item.id}`}>編集</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">メニューを開く</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.status === NewsStatus.PUBLISHED ? (
            <DropdownMenuItem onClick={handleUnpublish}>
              下書きに戻す
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handlePublish}>
              公開する
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<NewsData>[] = [
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => <NewsStatusBadge status={row.getValue('status')} />,
    enableSorting: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="タイトル" />
    ),
    cell: ({ row }) => (
      <div className="max-w-xs truncate font-medium">{row.getValue('title')}</div>
    ),
  },
  {
    accessorKey: 'publishedAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="公開日時" />
    ),
    cell: ({ row }) => {
      const publishedAt = row.getValue<string | null>('publishedAt')
      return (
        <span className="text-muted-foreground">
          {publishedAt
            ? format(new Date(publishedAt), 'yyyy/MM/dd HH:mm', { locale: ja })
            : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="作成日時" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {format(new Date(row.getValue('createdAt')), 'yyyy/MM/dd HH:mm', { locale: ja })}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => <ActionCell item={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
]

// =============================================================================
// NewsTable Component
// =============================================================================

export function NewsTable({ news }: NewsTableProps) {
  const memoizedColumns = useMemo(() => columns, [])

  if (news.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">お知らせがありません</p>
        <Button asChild className="mt-4">
          <Link href="/admin/news/new">新規作成</Link>
        </Button>
      </div>
    )
  }

  return (
    <DataTable
      columns={memoizedColumns}
      data={news}
      filterColumn="title"
      filterPlaceholder="タイトルで検索..."
      emptyMessage="お知らせがありません"
      initialSorting={[{ id: 'publishedAt', desc: true }]}
      toolbarActions={
        <Button asChild>
          <Link href="/admin/news/new">新規作成</Link>
        </Button>
      }
    />
  )
}
