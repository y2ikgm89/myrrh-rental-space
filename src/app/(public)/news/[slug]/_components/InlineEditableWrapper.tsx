'use client'

/**
 * ニュース用インライン編集ラッパー
 *
 * 共有InlineEditableWrapperの薄いラッパー
 * ニュース記事（/news/[slug]）専用のpropsマッピング
 */

import { InlineEditableWrapper as SharedInlineEditableWrapper } from '@/public/components/inline-editor'
import type { ReactElement, ReactNode } from 'react'

// =============================================================================
// Types
// =============================================================================

type NewsInlineEditableWrapperProps = {
  /** ニュースID */
  newsId: string
  /** 初期HTMLコンテンツ */
  initialContent: string
  /** 管理者かどうか */
  isAdmin: boolean
  /** 静的コンテンツ（編集モードでない時に表示） */
  children: ReactNode
  /** コンテンツ幅のクラス名 */
  contentWidthClassName?: string
  /** コンテンツ幅のスタイル */
  contentWidthStyle?: React.CSSProperties
}

// =============================================================================
// Component
// =============================================================================

export function InlineEditableWrapper({
  newsId,
  initialContent,
  isAdmin,
  children,
  contentWidthClassName,
  contentWidthStyle,
}: NewsInlineEditableWrapperProps): ReactElement {
  return (
    <SharedInlineEditableWrapper
      contentType="news"
      contentId={newsId}
      initialContent={initialContent}
      isAdmin={isAdmin}
      contentWidthClassName={contentWidthClassName}
      contentWidthStyle={contentWidthStyle}
    >
      {children}
    </SharedInlineEditableWrapper>
  )
}
