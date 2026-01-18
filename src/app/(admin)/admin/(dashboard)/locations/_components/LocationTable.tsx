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
} from '@/admin/components/ui'
import { PublishSwitch } from './PublishSwitch'
import type { LocationWithStats } from '@/admin/lib/validations/location'

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
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">場所がありません</p>
        <Button asChild className="mt-4">
          <Link href="/admin/locations/new">新規作成</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>場所名</TableHead>
            <TableHead>住所</TableHead>
            <TableHead className="text-center">公開状態</TableHead>
            <TableHead className="text-right">スペース数</TableHead>
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
              <TableCell>
                <div className="text-sm">{location.address}</div>
              </TableCell>
              <TableCell className="text-center">
                <PublishSwitch
                  locationId={location.id}
                  isPublished={location.isPublished}
                />
              </TableCell>
              <TableCell className="text-right">
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
