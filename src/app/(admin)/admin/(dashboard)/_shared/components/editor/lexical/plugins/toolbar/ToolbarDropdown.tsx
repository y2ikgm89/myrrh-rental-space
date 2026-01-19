'use client'

/**
 * ツールバードロップダウン
 *
 * ツールバーのグループ化されたアクションをドロップダウンメニューで表示
 * キーボードショートカットを表示
 */

import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { tv } from 'tailwind-variants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/admin/components/ui'
const styles = tv({
  slots: {
    trigger: [
      'flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors',
      'hover:bg-muted text-muted-foreground hover:text-foreground',
      'data-[state=open]:bg-muted data-[state=open]:text-foreground',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    ],
    triggerIcon: 'w-4 h-4',
    triggerChevron: 'w-3 h-3 opacity-50',
    triggerLabel: 'text-sm font-medium hidden sm:inline',
    content: 'z-20 min-w-[180px]',
    item: 'flex items-center gap-2 cursor-pointer',
    itemIcon: 'w-4 h-4',
    itemLabel: 'flex-1',
  },
})()

export type ToolbarDropdownItem = {
  id: string
  icon: LucideIcon
  label: string
  shortcut?: string
  isActive?: boolean
  disabled?: boolean
  onClick: () => void
}

export type ToolbarDropdownGroup = {
  items: ToolbarDropdownItem[]
}

export type ToolbarDropdownProps = {
  icon: LucideIcon
  label: string
  groups: ToolbarDropdownGroup[]
  disabled?: boolean
}

export function ToolbarDropdown({
  icon: Icon,
  label,
  groups,
  disabled = false,
}: ToolbarDropdownProps) {
  // アクティブなアイテムがあるかチェック
  const hasActiveItem = groups.some((group) =>
    group.items.some((item) => item.isActive)
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={styles.trigger()}
        data-active={hasActiveItem || undefined}
      >
        <Icon className={styles.triggerIcon()} />
        <span className={styles.triggerLabel()}>{label}</span>
        <ChevronDown className={styles.triggerChevron()} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={styles.content()}
      >
        {groups.map((group, groupIndex) => (
          <div key={groupIndex}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled}
                onClick={item.onClick}
                className={styles.item()}
                data-active={item.isActive || undefined}
              >
                <item.icon className={styles.itemIcon()} />
                <span className={styles.itemLabel()}>{item.label}</span>
                {item.shortcut && (
                  <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
