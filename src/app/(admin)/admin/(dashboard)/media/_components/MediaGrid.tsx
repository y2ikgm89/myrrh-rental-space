'use client'

/**
 * メディアグリッド表示
 */

import { useState } from 'react'
import { Check, Copy, Trash2, Eye, FileText, Film, File } from 'lucide-react'
import type { MediaData } from '@/admin/types/media-picker'
import { MediaDetailDialog } from './MediaDetailDialog'
import { formatBytes } from '@/admin/lib/utils'
import { TYPE_CONFIG } from './constants'
import { useCopyUrl, useDeleteMedia } from './hooks'
import { isValidMediaType, MediaType } from '@/admin/lib/validations/media'

type Props = {
  items: MediaData[]
}

export function MediaGrid({ items }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<MediaData | null>(null)
  const handleCopyUrl = useCopyUrl()
  const { handleDelete, isPending } = useDeleteMedia()

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={`
              group relative aspect-square rounded-lg border overflow-hidden
              transition-all duration-200 cursor-pointer
              hover:ring-2 hover:ring-primary hover:shadow-lg
              ${selectedId === item.id ? 'ring-2 ring-primary' : ''}
            `}
            onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
          >
            {/* Thumbnail */}
            <MediaThumbnail item={item} />

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
              {/* Top: Actions */}
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyUrl(item.url)
                  }}
                  className="p-1.5 rounded bg-white/20 hover:bg-white/40 transition-colors"
                  title="URLをコピー"
                >
                  <Copy className="h-4 w-4 text-primary-foreground" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetailItem(item)
                  }}
                  className="p-1.5 rounded bg-white/20 hover:bg-white/40 transition-colors"
                  title="詳細"
                >
                  <Eye className="h-4 w-4 text-primary-foreground" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(item)
                  }}
                  disabled={isPending}
                  className="p-1.5 rounded bg-destructive/80 hover:bg-destructive transition-colors disabled:opacity-50"
                  title="削除"
                >
                  <Trash2 className="h-4 w-4 text-primary-foreground" />
                </button>
              </div>

              {/* Bottom: Info */}
              <div className="text-primary-foreground text-xs">
                <p className="truncate font-medium">{item.filename}</p>
                <p className="text-primary-foreground/70">{formatBytes(item.size)}</p>
              </div>
            </div>

            {/* Selection indicator */}
            {selectedId === item.id && (
              <div className="absolute top-2 left-2 p-1 rounded-full bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}

            {/* Type badge */}
            <TypeBadge type={item.type} />
          </div>
        ))}
      </div>

      <MediaDetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </>
  )
}

function MediaThumbnail({ item }: { item: MediaData }) {
  switch (item.type) {
    case 'IMAGE':
      return (
        
        <img
          src={item.url}
          alt={item.alt || item.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )
    case 'VIDEO':
      return (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <Film className="h-12 w-12 text-muted-foreground" />
        </div>
      )
    case 'DOCUMENT':
      return (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <FileText className="h-12 w-12 text-muted-foreground" />
        </div>
      )
    default:
      return (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <File className="h-12 w-12 text-muted-foreground" />
        </div>
      )
  }
}

function TypeBadge({ type }: { type: string }) {
  const mediaType = isValidMediaType(type) ? type : MediaType.OTHER
  const config = TYPE_CONFIG[mediaType]

  return (
    <span
      className={`absolute bottom-2 right-2 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground rounded ${config.color}`}
    >
      {config.label}
    </span>
  )
}
