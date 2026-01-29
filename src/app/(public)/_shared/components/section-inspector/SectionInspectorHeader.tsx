'use client'

/**
 * Section Inspector Header
 *
 * インスペクターパネルのヘッダー
 */

import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

type SectionInspectorHeaderProps = {
  title: string
  onClose?: () => void
  className?: string
}

export function SectionInspectorHeader({
  title,
  onClose,
  className,
}: SectionInspectorHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30',
        className
      )}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
