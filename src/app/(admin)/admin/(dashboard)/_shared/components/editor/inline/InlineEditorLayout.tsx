'use client'

/**
 * インラインエディターレイアウト
 *
 * Webflow型のフルページ編集レイアウト
 * キーボードショートカット、離脱警告などを提供
 *
 * 管理画面レイアウト内で動作（fixed inset-0ではなくrelative配置）
 */

import { useEffect } from 'react'
import { tv } from 'tailwind-variants'
import type { InlineEditorLayoutProps } from './types'

const styles = tv({
  slots: {
    wrapper: 'h-full flex flex-col bg-muted/30 relative',
    main: 'flex flex-1 overflow-hidden',
  },
})()

type UseKeyboardShortcutsProps = {
  onSave?: () => void
}

/**
 * キーボードショートカットフック
 */
function useKeyboardShortcuts({ onSave }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + S で保存
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        onSave?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSave])
}

type UseBeforeUnloadProps = {
  isDirty: boolean
}

/**
 * 離脱警告フック
 */
function useBeforeUnload({ isDirty }: UseBeforeUnloadProps) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault()
        // Chrome では returnValue の設定が必要
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
}

export function InlineEditorLayout({ children }: InlineEditorLayoutProps) {
  return (
    <div className={styles.wrapper()}>
      <div className={styles.main()}>{children}</div>
    </div>
  )
}

// フックをエクスポート
export { useKeyboardShortcuts, useBeforeUnload }
