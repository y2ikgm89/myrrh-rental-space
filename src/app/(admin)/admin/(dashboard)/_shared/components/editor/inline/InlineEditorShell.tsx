'use client'

/**
 * InlineEditorShell
 *
 * インラインエディタの共通レイアウトシェル
 * - フルスクリーンモード管理
 * - キーボードショートカット（Ctrl+S）
 * - 離脱警告
 * - レイアウト（ヘッダー + エディタ + サイドパネル）
 */

import type { FormEvent, ReactNode } from 'react'
import { useFullscreenMode, useKeyboardShortcuts, useBeforeUnload } from './hooks'
import { SIDE_PANEL_WIDTH } from './SidePanelShell'
import { useMediaQuery } from '@/shared/hooks'

type InlineEditorShellProps = {
  /** フォーム送信ハンドラ */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** Ctrl+S で呼ばれる保存ハンドラ */
  onSave?: () => void
  /** 未保存の変更があるか */
  isDirty?: boolean
  /** ヘッダー部分 */
  header: ReactNode
  /** メインコンテンツ（LexicalEditor等） */
  children: ReactNode
  /** サイドパネル（設定/コメント） */
  panel?: ReactNode
  /** パネルが開いているか */
  isPanelOpen?: boolean
}

export function InlineEditorShell({
  onSubmit,
  onSave,
  isDirty = false,
  header,
  children,
  panel,
  isPanelOpen = false,
}: InlineEditorShellProps) {
  // フルスクリーンモード（サイドバー・ヘッダー非表示）
  useFullscreenMode()

  // キーボードショートカット
  useKeyboardShortcuts({ onSave })

  // 離脱警告
  useBeforeUnload({ isDirty })

  // デスクトップかどうか（lg: 1024px以上）
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // デスクトップでパネルが開いている場合のみエディタ幅を狭くする
  const editorWidth = isDesktop && isPanelOpen
    ? `calc(100% - ${SIDE_PANEL_WIDTH.default}px)`
    : '100%'

  return (
    <form
      onSubmit={onSubmit}
      className="h-screen flex flex-col pt-14"
    >
      {/* ヘッダー（固定） */}
      {header}

      {/* メインエリア（エディタ + パネル） */}
      <div className="flex flex-1 overflow-hidden">
        {/* エディタ領域 */}
        <div
          className="h-full overflow-auto transition-[width] duration-300"
          style={{ width: editorWidth }}
        >
          {children}
        </div>

        {/* サイドパネル（固定幅、右側） */}
        {panel}
      </div>
    </form>
  )
}
