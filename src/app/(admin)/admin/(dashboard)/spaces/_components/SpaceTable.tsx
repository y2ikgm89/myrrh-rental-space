import Image from 'next/image'
import Link from 'next/link'
import {
  Button,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  PublishSwitch,
} from '@/admin/components/ui'
import { updateSpacePublish } from '@/admin/actions/space'
import type { SpaceWithStats } from '@/admin/lib/validations/space'
import { formatCurrency } from '@/shared/lib/utils'
import { EmptyState } from '@/admin/components/EmptyState'

// =============================================================================
// Types
// =============================================================================

type SpaceTableProps = {
  spaces: SpaceWithStats[]
}

// =============================================================================
// SpaceTable Component (Server Component)
// =============================================================================

export function SpaceTable({ spaces }: SpaceTableProps) {
  if (spaces.length === 0) {
    return (
      <EmptyState
        message="スペースがありません"
        action={{ label: '新規作成', href: '/admin/spaces/new' }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>スペース名</TableHead>
            <TableHead className="hidden lg:table-cell">住所</TableHead>
            <TableHead className="hidden text-right md:table-cell">定員</TableHead>
            <TableHead className="hidden text-right md:table-cell">時間料金</TableHead>
            <TableHead className="text-center">公開状態</TableHead>
            <TableHead className="hidden text-right lg:table-cell">予約数</TableHead>
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
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="text-sm">{space.address}</div>
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">
                <Badge variant="secondary">{space.capacity}名</Badge>
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">
                {formatCurrency(space.hourlyPrice)}
              </TableCell>
              <TableCell className="text-center">
                <PublishSwitch
                  id={space.id}
                  isPublished={space.isPublished}
                  onToggle={updateSpacePublish}
                />
              </TableCell>
              <TableCell className="hidden text-right lg:table-cell">
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
