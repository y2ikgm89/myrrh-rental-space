'use client'

/**
 * TableMenu コンポーネント
 *
 * テーブル操作用のドロップダウンメニュー
 */

import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'

interface TableMenuProps {
  editor: Editor
}

interface MenuItemProps {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function MenuItem({ onClick, disabled, children }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left',
        'hover:bg-muted transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {children}
    </button>
  )
}

export function TableMenu({ editor }: TableMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // テーブル内にいるかどうか
  const isInTable = editor.isActive('table')

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAction = (action: () => void) => {
    action()
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="テーブル"
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isInTable && 'bg-muted text-foreground'
        )}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v4h6V5H5Zm8 0v4h6V5h-6Zm6 6h-6v4h6v-4Zm0 6h-6v4h6v-4ZM11 21v-4H5v4h6Zm-6-6h6v-4H5v4Z" />
        </svg>
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 16l-6-6h12z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border bg-background p-1 shadow-lg">
          {/* テーブル挿入 */}
          {!isInTable && (
            <MenuItem
              onClick={() =>
                handleAction(() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                )
              }
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v4h6V5H5Zm8 0v4h6V5h-6Zm6 6h-6v4h6v-4Zm0 6h-6v4h6v-4ZM11 21v-4H5v4h6Zm-6-6h6v-4H5v4Z" />
              </svg>
              テーブルを挿入
            </MenuItem>
          )}

          {/* テーブル操作（テーブル内のみ） */}
          {isInTable && (
            <>
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">行</div>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().addRowBefore().run())}
              >
                上に行を追加
              </MenuItem>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().addRowAfter().run())}
              >
                下に行を追加
              </MenuItem>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().deleteRow().run())}
              >
                行を削除
              </MenuItem>

              <div className="my-1 h-px bg-border" />

              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">列</div>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().addColumnBefore().run())}
              >
                左に列を追加
              </MenuItem>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().addColumnAfter().run())}
              >
                右に列を追加
              </MenuItem>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().deleteColumn().run())}
              >
                列を削除
              </MenuItem>

              <div className="my-1 h-px bg-border" />

              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">セル</div>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().mergeCells().run())}
                disabled={!editor.can().mergeCells()}
              >
                セルを結合
              </MenuItem>
              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().splitCell().run())}
                disabled={!editor.can().splitCell()}
              >
                セルを分割
              </MenuItem>
              <MenuItem
                onClick={() =>
                  handleAction(() => editor.chain().focus().toggleHeaderCell().run())
                }
              >
                ヘッダー切り替え
              </MenuItem>

              <div className="my-1 h-px bg-border" />

              <MenuItem
                onClick={() => handleAction(() => editor.chain().focus().deleteTable().run())}
              >
                <span className="text-destructive">テーブルを削除</span>
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  )
}
