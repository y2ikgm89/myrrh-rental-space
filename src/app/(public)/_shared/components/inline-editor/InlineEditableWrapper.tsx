'use client'

/**
 * インライン編集可能ラッパー
 *
 * 管理者ユーザーのみに編集機能を提供するラッパーコンポーネント
 * URLの?edit=trueパラメータで編集モードを切り替え
 */

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { EditModeToggle } from './EditModeToggle'
import { PublicInlineEditor, type ContentType } from './PublicInlineEditor'
import type { ReactElement, ReactNode } from 'react'

// =============================================================================
// Types
// =============================================================================

export type InlineEditableWrapperProps = {
  /** コンテンツタイプ */
  contentType: ContentType
  /** コンテンツID（slug または id） */
  contentId: string
  /** 初期HTMLコンテンツ */
  initialContent: string
  /** 管理者かどうか */
  isAdmin: boolean
  /** 子要素（静的コンテンツ） */
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
  contentType,
  contentId,
  initialContent,
  isAdmin,
  children,
  contentWidthClassName,
  contentWidthStyle,
}: InlineEditableWrapperProps): ReactElement {
  const searchParams = useSearchParams()
  const isEditMode = searchParams.get('edit') === 'true'
  const saveRef = useRef<(() => Promise<void>) | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  // 保存状態変更ハンドラー
  const handleSaveStateChange = (state: 'idle' | 'saving' | 'saved' | 'error') => {
    setIsSaving(state === 'saving')
    setIsSaved(state === 'saved')
  }

  // 保存ハンドラー
  const handleSave = async () => {
    if (saveRef.current) {
      await saveRef.current()
    }
  }

  // 非管理者には静的コンテンツのみ表示
  if (!isAdmin) {
    return <>{children}</>
  }

  // 管理者：編集モードに応じてコンテンツを表示
  return (
    <>
      {isEditMode ? (
        <PublicInlineEditor
          contentType={contentType}
          contentId={contentId}
          initialContent={initialContent}
          onSaveStateChange={handleSaveStateChange}
          saveRef={saveRef}
          contentWidthClassName={contentWidthClassName}
          contentWidthStyle={contentWidthStyle}
        />
      ) : (
        children
      )}

      {/* フローティング編集ボタン */}
      <EditModeToggle
        isEditMode={isEditMode}
        isSaving={isSaving}
        isSaved={isSaved}
        onSave={handleSave}
      />
    </>
  )
}
