'use client'

import Link from 'next/link'
import { useTransition, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Badge,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type ColumnDef,
} from '@/components/admin/ui'
import { BlogPostStatusBadge } from '@/components/admin/status-badges'
import { publishBlogPost, unpublishBlogPost } from '@/actions/admin/blog'
import type { BlogPostData } from '@/actions/admin/blog'
import { BlogPostStatus } from '@/generated/prisma/client/enums'

// =============================================================================
// Types
// =============================================================================

type BlogTableProps = {
  posts: BlogPostData[]
}

// =============================================================================
// Action Cell Component
// =============================================================================

function ActionCell({ post }: { post: BlogPostData }) {
  const [isPending, startTransition] = useTransition()

  const handlePublish = useCallback(() => {
    startTransition(async () => {
      const result = await publishBlogPost(post.id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }, [post.id])

  const handleUnpublish = useCallback(() => {
    startTransition(async () => {
      const result = await unpublishBlogPost(post.id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }, [post.id])

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/blog/${post.id}`}>編集</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">メニューを開く</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {post.status === BlogPostStatus.PUBLISHED ? (
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

const columns: ColumnDef<BlogPostData>[] = [
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => <BlogPostStatusBadge status={row.getValue('status')} />,
    enableSorting: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="タイトル" />
    ),
    cell: ({ row }) => (
      <div>
        <div className="max-w-xs truncate font-medium">{row.getValue('title')}</div>
        <div className="text-xs text-muted-foreground truncate">
          /{row.original.slug}
        </div>
      </div>
    ),
  },
  {
    id: 'category',
    accessorFn: (row) => row.category.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="カテゴリ" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.category.name}</Badge>
    ),
  },
  {
    accessorKey: 'viewCount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="PV" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue<number>('viewCount').toLocaleString()}
      </span>
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
    id: 'actions',
    header: '操作',
    cell: ({ row }) => <ActionCell post={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
]

// =============================================================================
// BlogTable Component
// =============================================================================

export function BlogTable({ posts }: BlogTableProps) {
  const memoizedColumns = useMemo(() => columns, [])

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">ブログ記事がありません</p>
        <Button asChild className="mt-4">
          <Link href="/admin/blog/new">新規作成</Link>
        </Button>
      </div>
    )
  }

  return (
    <DataTable
      columns={memoizedColumns}
      data={posts}
      filterColumn="title"
      filterPlaceholder="タイトルで検索..."
      emptyMessage="ブログ記事がありません"
      initialSorting={[{ id: 'publishedAt', desc: true }]}
      toolbarActions={
        <Button asChild>
          <Link href="/admin/blog/new">新規作成</Link>
        </Button>
      }
    />
  )
}
