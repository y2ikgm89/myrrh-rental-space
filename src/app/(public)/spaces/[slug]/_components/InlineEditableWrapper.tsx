'use client'

/**
 * スペース用インライン編集ラッパー
 *
 * 共有InlineEditableWrapperの薄いラッパー
 * スペース詳細（/spaces/[slug]）専用のpropsマッピング
 * スペースのdescriptionフィールドを編集
 */

import { InlineEditableWrapper as SharedInlineEditableWrapper } from '@/public/components/inline-editor'
import type { ReactElement, ReactNode } from 'react'

// =============================================================================
// Types
// =============================================================================

type SpaceInlineEditableWrapperProps = {
  /** スペースID */
  spaceId: string
  /** 初期HTMLコンテンツ（description） */
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
  spaceId,
  initialContent,
  isAdmin,
  children,
  contentWidthClassName,
  contentWidthStyle,
}: SpaceInlineEditableWrapperProps): ReactElement {
  return (
    <SharedInlineEditableWrapper
      contentType="space"
      contentId={spaceId}
      initialContent={initialContent}
      isAdmin={isAdmin}
      contentWidthClassName={contentWidthClassName}
      contentWidthStyle={contentWidthStyle}
    >
      {children}
    </SharedInlineEditableWrapper>
  )
}
