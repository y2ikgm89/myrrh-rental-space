'use client'

/**
 * ページ用インライン編集ラッパー
 *
 * 共有InlineEditableWrapperの薄いラッパー
 * ページ（/[slug]）専用のpropsマッピング
 */

import { InlineEditableWrapper as SharedInlineEditableWrapper } from '@/public/components/inline-editor'
import type { ReactElement, ReactNode } from 'react'

// =============================================================================
// Types
// =============================================================================

type PageInlineEditableWrapperProps = {
  /** ページスラッグ */
  slug: string
  /** ページタイトル（未使用だが互換性のため保持） */
  title: string
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
  slug,
  title: _title,
  initialContent,
  isAdmin,
  children,
  contentWidthClassName,
  contentWidthStyle,
}: PageInlineEditableWrapperProps): ReactElement {
  return (
    <SharedInlineEditableWrapper
      contentType="page"
      contentId={slug}
      initialContent={initialContent}
      isAdmin={isAdmin}
      contentWidthClassName={contentWidthClassName}
      contentWidthStyle={contentWidthStyle}
    >
      {children}
    </SharedInlineEditableWrapper>
  )
}
