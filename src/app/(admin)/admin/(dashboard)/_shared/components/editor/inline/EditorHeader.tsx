'use client'

/**
 * エディターヘッダー
 *
 * インラインエディターの上部ナビゲーション
 * 保存、プレビュー、設定パネル切り替えなどのアクションを提供
 */

import { ArrowLeft, Settings, Eye, Save, Loader2, Globe, GlobeLock } from 'lucide-react'
import { tv } from 'tailwind-variants'
import { Button } from '@/admin/components/ui'
import { Z_INDEX } from '@/admin/lib/styles/z-index'
import type { EditorHeaderProps } from './types'

const styles = tv({
  slots: {
    header: `sticky top-0 z-[${Z_INDEX.sticky}] border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60`,
    container: 'flex h-14 items-center justify-between px-4',
    left: 'flex items-center gap-3',
    center: 'flex-1 flex items-center justify-center',
    right: 'flex items-center gap-2',
    titleSection: 'flex items-center gap-2',
    title: 'text-base font-medium truncate max-w-[300px]',
    slug: 'text-sm text-muted-foreground',
    dirtyIndicator: 'ml-2 text-xs text-amber-500',
  },
})()

export function EditorHeader({
  title,
  slug,
  isDirty,
  isPending,
  isSidePanelOpen,
  onToggleSidePanel,
  onSave,
  onPreview,
  onBack,
  extraActions,
  publishActions,
}: EditorHeaderProps) {
  const isPublished = publishActions?.status === 'PUBLISHED'

  return (
    <header className={styles.header()}>
      <div className={styles.container()}>
        {/* 左側: 戻るボタン + タイトル */}
        <div className={styles.left()}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">戻る</span>
          </Button>

          <div className={styles.titleSection()}>
            <span className={styles.title()}>{title || '無題'}</span>
            <span className={styles.slug()}>/{slug}</span>
            {isDirty && (
              <span className={styles.dirtyIndicator()}>未保存</span>
            )}
          </div>
        </div>

        {/* 右側: アクションボタン */}
        <div className={styles.right()}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreview}
            className="gap-1"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">プレビュー</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleSidePanel}
            className={isSidePanelOpen ? 'bg-accent' : ''}
          >
            <Settings className="h-4 w-4" />
            <span className="sr-only">設定</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={isPending || !isDirty}
            className="gap-1"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isPending ? '保存中...' : '保存'}
            </span>
          </Button>

          {/* 公開/非公開ボタン */}
          {publishActions && (
            isPublished ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={publishActions.onUnpublish}
                disabled={isPending}
                className="gap-1 text-amber-600 hover:text-amber-700"
              >
                <GlobeLock className="h-4 w-4" />
                <span className="hidden sm:inline">非公開にする</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={publishActions.onPublish}
                disabled={isPending || isDirty}
                className="gap-1 bg-green-600 hover:bg-green-700"
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">公開する</span>
              </Button>
            )
          )}

          {extraActions}
        </div>
      </div>
    </header>
  )
}
