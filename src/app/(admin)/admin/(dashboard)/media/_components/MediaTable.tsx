'use client'

/**
 * メディアテーブル表示
 */

import { useState } from 'react'
import { FileText, Film, File, Image } from 'lucide-react'
import type { MediaData } from '@/admin/types/media-picker'
import { MediaDetailDialog } from './MediaDetailDialog'
import { formatDate } from '@/shared/lib/utils'
import { formatBytes } from '@/admin/lib/utils'
import { USAGE_LABELS } from './constants'
import { createCopyUrlHandler, useDeleteMedia } from './hooks'
import { isValidMediaUsage } from '@/admin/lib/validations/media'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from '@/admin/components/ActionDropdown'

type Props = {
  items: MediaData[]
}

const TYPE_ICONS = {
  IMAGE: Image,
  VIDEO: Film,
  DOCUMENT: FileText,
  OTHER: File,
} as const

function hasTypeIcon(type: string): type is keyof typeof TYPE_ICONS {
  return type in TYPE_ICONS
}

export function MediaTable({ items }: Props) {
  const [detailItem, setDetailItem] = useState<MediaData | null>(null)
  const handleCopyUrl = createCopyUrlHandler()
  const { handleDelete, isPending } = useDeleteMedia()

  return (
    <>
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">種別</TableHead>
              <TableHead>ファイル名</TableHead>
              <TableHead className="hidden w-24 md:table-cell">サイズ</TableHead>
              <TableHead className="hidden w-24 lg:table-cell">用途</TableHead>
              <TableHead className="hidden w-32 md:table-cell">アップロード日</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const TypeIcon = hasTypeIcon(item.type) ? TYPE_ICONS[item.type] : File

              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <TypeIcon className="h-5 w-5 text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.type === 'IMAGE' && (
                        
                        <img
                          src={item.url}
                          alt={item.alt || item.filename}
                          className="h-10 w-10 rounded object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium truncate max-w-xs">{item.filename}</p>
                        {item.alt && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {item.alt}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatBytes(item.size)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm">
                      {isValidMediaUsage(item.usage) ? USAGE_LABELS[item.usage] : item.usage}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-sm md:table-cell">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <ActionDropdown disabled={isPending}>
                      <ActionDropdownItem onClick={() => handleCopyUrl(item.url)}>
                        URLをコピー
                      </ActionDropdownItem>
                      <ActionDropdownItem onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                        新しいタブで開く
                      </ActionDropdownItem>
                      <ActionDropdownItem onClick={() => setDetailItem(item)}>
                        詳細
                      </ActionDropdownItem>
                      <ActionDropdownSeparator />
                      <ActionDropdownItem destructive onClick={() => handleDelete(item)} disabled={isPending}>
                        削除
                      </ActionDropdownItem>
                    </ActionDropdown>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <MediaDetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </>
  )
}
