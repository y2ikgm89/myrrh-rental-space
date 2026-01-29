'use client'

/**
 * 投稿用インライン編集ラッパー
 *
 * 共有InlineEditableWrapperの薄いラッパー
 * 投稿記事（/posts/[slug]）専用のpropsマッピング
 */

import { InlineEditableWrapper as SharedInlineEditableWrapper } from '@/public/components/inline-editor'
import type { ReactElement, ReactNode } from 'react'

// =============================================================================
// Types
// =============================================================================

type PostInlineEditableWrapperProps = {
  /** 投稿ID */
  postId: string
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
  postId,
  initialContent,
  isAdmin,
  children,
  contentWidthClassName,
  contentWidthStyle,
}: PostInlineEditableWrapperProps): ReactElement {
  return (
    <SharedInlineEditableWrapper
      contentType="post"
      contentId={postId}
      initialContent={initialContent}
      isAdmin={isAdmin}
      contentWidthClassName={contentWidthClassName}
      contentWidthStyle={contentWidthStyle}
    >
      {children}
    </SharedInlineEditableWrapper>
  )
}
