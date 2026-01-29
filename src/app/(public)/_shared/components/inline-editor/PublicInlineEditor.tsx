'use client'

/**
 * 公開ページ用インラインエディタ
 *
 * 公開ページで直接コンテンツを編集するためのLexicalエディタラッパー
 * 管理画面のLexicalEditorを遅延読み込みで使用
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { tv } from 'tailwind-variants'
import { updateContentInline } from '@/public/actions/inline-update'
import type { LexicalEditorProps } from '@/admin/components/editor/lexical/types'
import type { ReactElement } from 'react'

// =============================================================================
// Lazy Load Lexical Editor
// =============================================================================

/**
 * 遅延読み込みLexicalエディタ（公開ページ用）
 *
 * 管理画面のLexicalEditorを再利用
 * - SSR無効
 * - シンプルなローディングUI
 */
const LazyLexicalEditor = dynamic<LexicalEditorProps>(
  () =>
    import('@/admin/components/editor/lexical/LexicalEditor').then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[300px] flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">
            エディタを読み込み中...
          </span>
        </div>
      </div>
    ),
  }
)

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    container: 'relative',
    editorWrapper: [
      'bg-background rounded-lg border border-primary/30 shadow-lg',
      'ring-2 ring-primary/20',
    ],
    editBanner: [
      'sticky top-0 z-10',
      'bg-primary/10 border-b border-primary/20',
      'px-4 py-2 text-sm text-primary-foreground/80',
      'flex items-center justify-between gap-4',
    ],
    bannerText: 'font-medium text-foreground',
    bannerHint: 'text-muted-foreground text-xs',
    statusIndicator: 'flex items-center gap-2 text-sm',
    statusDot: 'w-2 h-2 rounded-full',
    statusDotUnsaved: 'bg-warning animate-pulse',
    statusDotSaving: 'bg-primary animate-spin',
    statusDotSaved: 'bg-success',
  },
})()

// =============================================================================
// Types
// =============================================================================

/** コンテンツタイプ */
export type ContentType = 'page' | 'post' | 'news' | 'space' | 'homepage-section'

export type PublicInlineEditorProps = {
  /** コンテンツタイプ */
  contentType: ContentType
  /** コンテンツID（slug または id） */
  contentId: string
  /** 初期HTMLコンテンツ */
  initialContent: string
  /** 保存状態コールバック */
  onSaveStateChange?: (state: 'idle' | 'saving' | 'saved' | 'error') => void
  /** コンテンツ変更コールバック */
  onContentChange?: (html: string) => void
  /** 保存トリガーを親に渡す */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>
  /** コンテンツ幅のクラス名 */
  contentWidthClassName?: string
  /** コンテンツ幅のスタイル */
  contentWidthStyle?: React.CSSProperties
}

type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

// =============================================================================
// Component
// =============================================================================

export function PublicInlineEditor({
  contentType,
  contentId,
  initialContent,
  onSaveStateChange,
  onContentChange,
  saveRef,
  contentWidthClassName,
  contentWidthStyle,
}: PublicInlineEditorProps): ReactElement {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [_isPending, startTransition] = useTransition()
  const contentRef = useRef(initialContent)

  // コンテンツ変更ハンドラー
  const handleChange = useCallback(
    (html: string) => {
      contentRef.current = html

      // 内容が変更されたら unsaved 状態に
      if (html !== initialContent) {
        setSaveState('unsaved')
      }

      onContentChange?.(html)
    },
    [initialContent, onContentChange]
  )

  // 保存処理
  const handleSave = useCallback(async () => {
    setSaveState('saving')
    onSaveStateChange?.('saving')

    startTransition(async () => {
      const result = await updateContentInline({
        type: contentType,
        id: contentId,
        content: contentRef.current,
      })

      if (result.success) {
        setSaveState('saved')
        onSaveStateChange?.('saved')

        // 3秒後にidle状態に戻す
        setTimeout(() => {
          setSaveState('idle')
        }, 3000)
      } else {
        setSaveState('error')
        onSaveStateChange?.('error')
        console.error('Failed to save content:', result.error)
      }
    })
  }, [contentType, contentId, onSaveStateChange])

  // 親に保存関数を渡す（エフェクト内で更新）
  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSave
    }
  }, [saveRef, handleSave])

  return (
    <div className={styles.container()}>
      <div className={styles.editorWrapper()}>
        {/* 編集中バナー */}
        <div className={styles.editBanner()}>
          <div>
            <span className={styles.bannerText()}>編集モード</span>
            <span className={styles.bannerHint()}>
              {' '}
              - 変更は自動保存されません。保存ボタンを押してください。
            </span>
          </div>
          <div className={styles.statusIndicator()}>
            <span
              className={`${styles.statusDot()} ${
                saveState === 'unsaved'
                  ? styles.statusDotUnsaved()
                  : saveState === 'saving'
                    ? styles.statusDotSaving()
                    : saveState === 'saved'
                      ? styles.statusDotSaved()
                      : ''
              }`}
            />
            <span>
              {saveState === 'unsaved'
                ? '未保存'
                : saveState === 'saving'
                  ? '保存中...'
                  : saveState === 'saved'
                    ? '保存完了'
                    : saveState === 'error'
                      ? 'エラー'
                      : ''}
            </span>
          </div>
        </div>

        {/* Lexicalエディタ */}
        <LazyLexicalEditor
          content={initialContent}
          onChange={handleChange}
          showToolbar
          showInspector={false}
          height="auto"
          placeholder="ここにコンテンツを入力..."
          contentWidthClassName={contentWidthClassName}
          contentWidthStyle={contentWidthStyle}
        />
      </div>
    </div>
  )
}
