'use client'

/**
 * サイドパネルシェルコンポーネント
 *
 * ブログ・ニュース等の編集パネルで共通するシェル部分（オーバーレイ、アニメーション、ヘッダー）
 */

import { X } from 'lucide-react'
import { tv } from 'tailwind-variants'
import { Button } from '@/admin/components/ui'
import { Z_INDEX } from '@/admin/lib/styles/z-index'
import type { ReactNode } from 'react'

const styles = tv({
  slots: {
    overlay: [
      `fixed inset-0 z-[${Z_INDEX.overlay}] bg-black/20 transition-opacity duration-300`,
      'lg:hidden',
    ],
    panel: [
      `fixed right-0 top-0 z-[${Z_INDEX.editorSidePanel}] h-full bg-background border-l shadow-xl`,
      'transform transition-transform duration-300 ease-in-out',
    ],
    header: 'flex items-center justify-between p-4 border-b',
    title: 'text-lg font-semibold',
    content: 'flex-1 overflow-y-auto p-4',
  },
  variants: {
    isOpen: {
      true: {
        overlay: 'opacity-100',
        panel: 'translate-x-0',
      },
      false: {
        overlay: 'opacity-0 pointer-events-none',
        panel: 'translate-x-full',
      },
    },
    width: {
      default: { panel: 'w-full sm:w-[420px]' },
      narrow: { panel: 'w-full sm:w-96' },
    },
  },
  defaultVariants: {
    width: 'default',
  },
})

type SidePanelShellProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'default' | 'narrow'
}

export function SidePanelShell({
  isOpen,
  onClose,
  title,
  children,
  width = 'default',
}: SidePanelShellProps) {
  const classes = styles({ isOpen, width })

  return (
    <>
      <div className={classes.overlay()} onClick={onClose} aria-hidden="true" />

      <aside className={classes.panel()} aria-label="設定パネル">
        <div className={classes.header()}>
          <h2 className={classes.title()}>{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">閉じる</span>
          </Button>
        </div>

        <div className={classes.content()}>{children}</div>
      </aside>
    </>
  )
}
