'use client'

/**
 * PostListWidgetComponent
 *
 * エディタ内で記事リストウィジェットを表示・設定するReactコンポーネント
 * Tiptap React Node Viewとして使用
 */

import { useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { cn } from '@/lib/utils'
import type { PostListWidgetType } from './PostListWidgetExtension'

// ウィジェットタイプの設定
const WIDGET_CONFIG: Record<
  PostListWidgetType,
  { label: string; icon: React.ReactNode; description: string }
> = {
  recent: {
    label: '最新記事',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-8h4v2h-6V7h2v5Z" />
      </svg>
    ),
    description: '新着記事を表示',
  },
  popular: {
    label: '人気記事',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 23a7.5 7.5 0 0 0 7.5-7.5c0-.866-.23-1.697-.5-2.47-1.667 1.647-2.933 2.47-3.8 2.47 3.995-7 1.8-10-4.2-14.5.5 2-.5 4-2.5 6-1.5-1-2.5-3-2.5-6a7.498 7.498 0 0 0-1.5 14.5c0 1.38-.5 2.5-1.5 3.5.867.333 1.79.5 2.5.5a7.5 7.5 0 0 0 6.5-3.5Z" />
      </svg>
    ),
    description: '人気の記事を表示',
  },
  related: {
    label: '関連記事',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM9 9H5V5h4v4Zm11-6h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Zm-1 6h-4V5h4v4Zm1 4h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1Zm-1 6h-4v-4h4v4Zm-9-6H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1Zm-1 6H5v-4h4v4Z" />
      </svg>
    ),
    description: '同カテゴリの記事を表示',
  },
}

export function PostListWidgetComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const { type, count, title } = node.attrs as {
    type: PostListWidgetType
    count: number
    title?: string
  }

  const config = WIDGET_CONFIG[type]

  // 表示タイトル
  const displayTitle = title || config.label

  return (
    <NodeViewWrapper
      className={cn(
        'my-4 rounded-lg border-2 border-dashed transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 bg-muted/30',
        'not-prose' // Proseスタイルを無効化
      )}
    >
      <div className="p-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            {config.icon}
            <span className="text-sm font-medium">{displayTitle}</span>
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {count}件表示
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              'text-xs px-2 py-1 rounded transition-colors',
              isEditing
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground'
            )}
          >
            {isEditing ? '閉じる' : '設定'}
          </button>
        </div>

        {/* プレビュー（編集モードでない時） */}
        {!isEditing && (
          <div className="space-y-2">
            {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded bg-background/50"
              >
                <div className="w-12 h-12 rounded bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2 bg-muted/60 rounded w-1/2" />
                </div>
              </div>
            ))}
            {count > 3 && (
              <p className="text-xs text-center text-muted-foreground">
                ...他 {count - 3} 件
              </p>
            )}
          </div>
        )}

        {/* 設定パネル */}
        {isEditing && (
          <div className="space-y-4 pt-2 border-t">
            {/* タイプ選択 */}
            <div>
              <label className="block text-xs font-medium mb-2">表示タイプ</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(WIDGET_CONFIG) as [PostListWidgetType, typeof config][]).map(
                  ([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateAttributes({ type: key })}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded border text-xs transition-colors',
                        type === key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted'
                      )}
                    >
                      {cfg.icon}
                      <span>{cfg.label}</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* 表示件数 */}
            <div>
              <label className="block text-xs font-medium mb-2">表示件数</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={count}
                  onChange={(e) => updateAttributes({ count: parseInt(e.target.value, 10) })}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-8 text-center">{count}</span>
              </div>
            </div>

            {/* カスタムタイトル */}
            <div>
              <label className="block text-xs font-medium mb-2">
                カスタムタイトル
                <span className="text-muted-foreground font-normal ml-1">（任意）</span>
              </label>
              <input
                type="text"
                value={title || ''}
                onChange={(e) => updateAttributes({ title: e.target.value || null })}
                placeholder={config.label}
                className="w-full h-8 rounded border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* フッター情報 */}
        <div className="mt-3 pt-2 border-t border-dashed text-xs text-muted-foreground">
          <p>
            このウィジェットは公開ページで動的に記事リストを表示します。
          </p>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
