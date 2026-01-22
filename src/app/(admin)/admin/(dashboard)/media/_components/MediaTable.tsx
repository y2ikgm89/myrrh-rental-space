'use client'

/**
 * メディアテーブル表示
 */

import { useState } from 'react'
import { Copy, Trash2, Eye, ExternalLink, FileText, Film, File, Image } from 'lucide-react'
import type { MediaData } from '@/admin/actions/media'
import { MediaDetailDialog } from './MediaDetailDialog'
import { formatDate } from '@/shared/lib/utils'
import { formatBytes } from '@/admin/lib/utils'
import { USAGE_LABELS } from './constants'
import { useCopyUrl, useDeleteMedia } from './hooks'
import { isValidMediaUsage } from '@/admin/lib/validations/media'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'

type Props = {
  items: MediaData[]
}

const TYPE_ICONS = {
  IMAGE: Image,
  VIDEO: Film,
  DOCUMENT: FileText,
  OTHER: File,
} as const

export function MediaTable({ items }: Props) {
  const [detailItem, setDetailItem] = useState<MediaData | null>(null)
  const handleCopyUrl = useCopyUrl()
  const { handleDelete, isPending } = useDeleteMedia()

  return (
    <>
      <div className="rounded-lg border bg-white overflow-hidden">
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
              const TypeIcon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] ?? File

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
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(item.url)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="URLをコピー"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="新しいタブで開く"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setDetailItem(item)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="詳細"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isPending}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors disabled:opacity-50"
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
