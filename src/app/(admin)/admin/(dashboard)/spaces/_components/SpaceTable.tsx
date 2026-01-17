'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Button,
  Badge,
  Switch,
  DataTable,
  DataTableColumnHeader,
  type ColumnDef,
} from '@/components/admin/ui'
import { updateSpacePublish } from '@/actions/admin/space'
import type { SpaceWithStats } from '@/lib/validations/space'

// =============================================================================
// Types
// =============================================================================

type SpaceTableProps = {
  spaces: SpaceWithStats[]
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(price)
}

// =============================================================================
// Cell Components
// =============================================================================

function PublishSwitch({
  spaceId,
  isPublished,
}: {
  spaceId: string
  isPublished: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await updateSpacePublish(spaceId, checked)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Switch
        checked={isPublished}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <span className="text-xs text-muted-foreground">
        {isPublished ? '公開' : '非公開'}
      </span>
    </div>
  )
}

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<SpaceWithStats>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="スペース名" />
    ),
    cell: ({ row }) => {
      const space = row.original
      return (
        <div className="flex items-center gap-3">
          {space.mainImageUrl && (
            <Image
              src={space.mainImageUrl}
              alt={space.name}
              width={40}
              height={40}
              className="rounded object-cover"
              style={{ width: 40, height: 40 }}
            />
          )}
          <div>
            <div className="font-medium">{space.name}</div>
            <div className="text-sm text-muted-foreground line-clamp-1">
              {space.description.slice(0, 50)}...
            </div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'address',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="住所" />
    ),
    cell: ({ row }) => (
      <div className="text-sm">{row.getValue('address')}</div>
    ),
  },
  {
    accessorKey: 'capacity',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="定員" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <Badge variant="secondary">{row.getValue<number>('capacity')}名</Badge>
      </div>
    ),
  },
  {
    accessorKey: 'hourlyPrice',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="時間料金" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {formatPrice(row.getValue('hourlyPrice'))}
      </div>
    ),
  },
  {
    accessorKey: 'isPublished',
    header: '公開状態',
    cell: ({ row }) => (
      <PublishSwitch
        spaceId={row.original.id}
        isPublished={row.getValue('isPublished')}
      />
    ),
    enableSorting: false,
  },
  {
    id: 'reservations',
    accessorFn: (row) => row._count.reservations,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="予約数" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <Badge variant="secondary">{row.original._count.reservations}件</Badge>
      </div>
    ),
  },
  {
    id: 'actions',
    header: () => <div className="text-right">操作</div>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/spaces/${row.original.id}`}>詳細</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/spaces/${row.original.id}/edit`}>編集</Link>
        </Button>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
]

// =============================================================================
// SpaceTable Component
// =============================================================================

export function SpaceTable({ spaces }: SpaceTableProps) {
  // メモ化（データが変わらない限り再計算しない）
  const memoizedColumns = useMemo(() => columns, [])

  if (spaces.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">スペースがありません</p>
        <Button asChild className="mt-4">
          <Link href="/admin/spaces/new">新規作成</Link>
        </Button>
      </div>
    )
  }

  return (
    <DataTable
      columns={memoizedColumns}
      data={spaces}
      filterColumn="name"
      filterPlaceholder="スペース名で検索..."
      emptyMessage="スペースがありません"
      initialSorting={[{ id: 'name', desc: false }]}
      toolbarActions={
        <Button asChild>
          <Link href="/admin/spaces/new">新規作成</Link>
        </Button>
      }
    />
  )
}
