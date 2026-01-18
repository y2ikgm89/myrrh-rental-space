'use client'

/**
 * ツールバーボタン
 *
 * ツールチップ付きのツールバーボタンコンポーネント
 * キーボードショートカットを表示
 */

import type { LucideIcon } from 'lucide-react'
import { tv } from 'tailwind-variants'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/admin/components/ui'

const styles = tv({
  base: [
    'p-1.5 rounded-md transition-colors',
    'hover:bg-muted text-muted-foreground hover:text-foreground',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ],
  variants: {
    active: {
      true: 'bg-primary/20 text-primary',
    },
  },
})

export type ToolbarButtonProps = {
  icon: LucideIcon
  label: string
  shortcut?: string
  isActive?: boolean
  disabled?: boolean
  onClick: () => void
}

export function ToolbarButton({
  icon: Icon,
  label,
  shortcut,
  isActive = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={styles({ active: isActive })}
          aria-label={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{label}</span>
          {shortcut && (
            <span className="text-xs text-muted-foreground">{shortcut}</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
