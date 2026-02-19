'use client'

import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type ActionDropdownProps = {
  children: React.ReactNode
  disabled?: boolean
}

type ActionDropdownItemProps = {
  href?: string
  onClick?: () => void
  destructive?: boolean
  disabled?: boolean
  children: React.ReactNode
}

// =============================================================================
// Components
// =============================================================================

/**
 * 管理画面テーブル行の操作メニュー共通コンポーネント
 *
 * @example
 * ```tsx
 * <ActionDropdown>
 *   <ActionDropdownItem href={`/admin/spaces/${id}/edit`}>編集</ActionDropdownItem>
 *   <ActionDropdownItem href={`/admin/spaces/${id}`}>詳細</ActionDropdownItem>
 *   <ActionDropdownSeparator />
 *   <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>削除</ActionDropdownItem>
 * </ActionDropdown>
 * ```
 */
export function ActionDropdown({ children, disabled }: ActionDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">操作メニューを開く</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ActionDropdownItem({
  href,
  onClick,
  destructive = false,
  disabled = false,
  children,
}: ActionDropdownItemProps) {
  const className = destructive ? 'text-destructive focus:text-destructive' : undefined

  if (href) {
    return (
      <DropdownMenuItem asChild disabled={disabled} className={className}>
        <Link href={href}>{children}</Link>
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem onClick={onClick} disabled={disabled} className={className}>
      {children}
    </DropdownMenuItem>
  )
}

export { DropdownMenuSeparator as ActionDropdownSeparator }
