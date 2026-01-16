'use client'

/**
 * MediaItem
 *
 * メディアグリッド/リストの個別アイテム
 */

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MediaData } from '@/actions/admin/media'

interface MediaItemProps {
  media: MediaData
  isSelected: boolean
  onSelect: (media: MediaData) => void
  viewMode: 'grid' | 'list'
  disabled?: boolean
}

export function MediaItem({
  media,
  isSelected,
  onSelect,
  viewMode,
  disabled = false,
}: MediaItemProps) {
  const handleClick = () => {
    if (!disabled) {
      onSelect(media)
    }
  }

  if (viewMode === 'grid') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
          'hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isSelected
            ? 'border-primary ring-2 ring-primary'
            : 'border-transparent',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt={media.alt || media.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {isSelected && (
          <div className="absolute right-1 top-1 rounded-full bg-primary p-1">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected && 'bg-primary/10',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt={media.alt || media.filename}
        className="h-12 w-12 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{media.filename}</p>
        <p className="text-sm text-muted-foreground">
          {formatBytes(media.size)}
        </p>
      </div>
      {isSelected && <Check className="h-5 w-5 shrink-0 text-primary" />}
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
