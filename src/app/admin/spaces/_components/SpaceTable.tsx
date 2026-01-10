'use client'

import Image from 'next/image'
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
  Badge,
  Switch,
} from '@/components/admin/ui'
import { updateSpacePublish } from '@/actions/admin/space'
import type { SpaceWithStats } from '@/lib/validations/space'

type SpaceTableProps = {
  spaces: SpaceWithStats[]
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(price)
}

function PublishSwitch({
  spaceId,
  isPublished,
}: {
  spaceId: string
  isPublished: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleChange = async (checked: boolean) => {
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
    <div className="flex items-center gap-2">
      <Switch
        checked={isPublished}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <span className="text-sm text-muted-foreground">
        {isPublished ? '公開中' : '非公開'}
      </span>
    </div>
  )
}

export function SpaceTable({ spaces }: SpaceTableProps) {
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
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>スペース名</TableHead>
            <TableHead>住所</TableHead>
            <TableHead className="text-right">定員</TableHead>
            <TableHead className="text-right">時間料金</TableHead>
            <TableHead>公開状態</TableHead>
            <TableHead className="text-right">予約数</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {spaces.map((space) => (
            <TableRow key={space.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {space.mainImageUrl && (
                    <Image
                      src={space.mainImageUrl}
                      alt={space.name}
                      width={40}
                      height={40}
                      className="rounded object-cover"
                    />
                  )}
                  <div>
                    <div className="font-medium">{space.name}</div>
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {space.description.slice(0, 50)}...
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{space.address}</div>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{space.capacity}名</Badge>
              </TableCell>
              <TableCell className="text-right">
                {formatPrice(space.hourlyPrice)}
              </TableCell>
              <TableCell>
                <PublishSwitch spaceId={space.id} isPublished={space.isPublished} />
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{space._count.reservations}件</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/spaces/${space.id}`}>詳細</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/spaces/${space.id}/edit`}>編集</Link>
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
