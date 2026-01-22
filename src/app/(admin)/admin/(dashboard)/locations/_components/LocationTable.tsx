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
import { toggleLocationPublish } from '@/admin/actions/location'
import type { LocationWithStats } from '@/admin/lib/validations/location'
import { EmptyState } from '@/admin/components/EmptyState'

// =============================================================================
// Types
// =============================================================================

type LocationTableProps = {
  locations: LocationWithStats[]
}

// =============================================================================
// LocationTable Component (Server Component)
// =============================================================================

export function LocationTable({ locations }: LocationTableProps) {
  if (locations.length === 0) {
    return (
      <EmptyState
        message="場所がありません"
        action={{ label: '新規作成', href: '/admin/locations/new' }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>場所名</TableHead>
            <TableHead className="hidden lg:table-cell">住所</TableHead>
            <TableHead className="text-center">公開状態</TableHead>
            <TableHead className="hidden text-right md:table-cell">スペース数</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.map((location) => (
            <TableRow key={location.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {location.imageUrl && (
                    <Image
                      src={location.imageUrl}
                      alt={location.name}
                      width={40}
                      height={40}
                      className="rounded object-cover"
                      style={{ width: 40, height: 40 }}
                    />
                  )}
                  <div>
                    <div className="font-medium">{location.name}</div>
                    {location.description && (
                      <div className="text-sm text-muted-foreground line-clamp-1">
                        {location.description.slice(0, 50)}
                        {location.description.length > 50 && '...'}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="text-sm">{location.address}</div>
              </TableCell>
              <TableCell className="text-center">
                <PublishSwitch
                  id={location.id}
                  isPublished={location.isPublished}
                  onToggle={toggleLocationPublish}
                />
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">
                <Badge variant="secondary">{location._count.spaces}件</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/locations/${location.id}`}>詳細</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/locations/${location.id}/edit`}>編集</Link>
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
