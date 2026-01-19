'use client'

/**
 * エディターキャンバス
 *
 * WYSIWYG編集エリア
 * 公開ページと同じスタイルでコンテンツを編集
 * タイトルのインライン編集に対応
 */

import dynamic from 'next/dynamic'
import { tv } from 'tailwind-variants'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { InlineTitleEditor } from './InlineTitleEditor'
import type { EditorCanvasProps } from './types'

const LexicalEditor = dynamic(
  () => import('@/admin/components/editor').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)

const styles = tv({
  slots: {
    wrapper: 'flex-1 overflow-auto bg-background',
    container: 'mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8',
    editorWrapper: 'bg-background rounded-lg',
  },
})()

export function EditorCanvas({
  title,
  onTitleChange,
  content,
  onChange,
  disabled = false,
  showTitle = false,
}: EditorCanvasProps) {
  return (
    <div className={styles.wrapper()}>
      <div className={styles.container()}>
        <div className={styles.editorWrapper()}>
          {showTitle && onTitleChange && (
            <InlineTitleEditor
              value={title || ''}
              onChange={onTitleChange}
              placeholder="タイトルを入力..."
              disabled={disabled}
            />
          )}
          <LexicalEditor
            content={content}
            onChange={onChange}
            disabled={disabled}
            placeholder="コンテンツを入力..."
            minHeight="calc(100vh - 200px)"
            showToolbar={true}
            showFloatingToolbar={true}
            className={EDITOR_PROSE_CLASSES}
          />
        </div>
      </div>
    </div>
  )
}
