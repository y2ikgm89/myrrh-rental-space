/**
 * インラインエディター型定義
 */

import type { ReactNode } from 'react'
import type { FieldErrors, UseFormRegister, Control, UseFormSetValue } from 'react-hook-form'
import type { BlogPostStatus, NewsStatus } from '@/shared/generated/prisma/enums'

/**
 * ページ編集用フォームデータ
 */
export type PageEditorFormData = {
  title: string
  content: string
  description?: string
  metaDescription?: string
  metaKeywords?: string
  ogpTitle?: string
  ogpDescription?: string
  ogpImageUrl?: string
  isPublished: boolean
  publishedAt?: string
  contentWidth?: string
  contentWidthCustom?: string
  showSidebar?: boolean | null  // null=デフォルト（カスタムページは非表示）、true=表示、false=非表示
}

/**
 * エディターヘッダープロパティ
 */
export type EditorHeaderProps = {
  title: string
  slug: string
  isDirty: boolean
  isPending: boolean
  isSidePanelOpen: boolean
  onToggleSidePanel: () => void
  onSave: () => void
  onPreview: () => void
  onBack: () => void
  extraActions?: ReactNode
  /** 公開/非公開ボタンの表示 */
  publishActions?: {
    status: BlogPostStatus | NewsStatus
    onPublish: () => void
    onUnpublish: () => void
  }
}

/**
 * エディターキャンバスプロパティ
 */
export type EditorCanvasProps = {
  title?: string
  onTitleChange?: (title: string) => void
  content: string
  onChange: (html: string) => void
  disabled?: boolean
  showTitle?: boolean
}

/**
 * サイドパネルプロパティ
 */
export type SidePanelProps = {
  isOpen: boolean
  onClose: () => void
  register: UseFormRegister<PageEditorFormData>
  control: Control<PageEditorFormData>
  errors: FieldErrors<PageEditorFormData>
  setValue: UseFormSetValue<PageEditorFormData>
  disabled?: boolean
}

/**
 * サイドパネルセクションプロパティ
 */
export type SidePanelSectionProps = {
  register: UseFormRegister<PageEditorFormData>
  control: Control<PageEditorFormData>
  errors: FieldErrors<PageEditorFormData>
  setValue?: UseFormSetValue<PageEditorFormData>
  disabled?: boolean
}

/**
 * インラインエディターレイアウトプロパティ
 */
export type InlineEditorLayoutProps = {
  children: ReactNode
}

/**
 * ブログ編集用フォームデータ
 */
export type BlogEditorFormData = {
  title: string
  slug: string
  excerpt: string
  content: string
  thumbnailUrl: string
  ogpImageUrl?: string
  categoryId: string
  tags?: string
  metaDescription?: string
  metaKeywords?: string
  ogpTitle?: string
  ogpDescription?: string
  status: BlogPostStatus
  publishedAt?: string
  contentWidth?: string
  contentWidthCustom?: string
}

/**
 * ブログカテゴリオプション
 */
export type BlogCategoryOption = {
  id: string
  name: string
}

/**
 * ニュース編集用フォームデータ
 */
export type NewsEditorFormData = {
  title: string
  content: string
  status: NewsStatus
  publishedAt?: string
  contentWidth?: string
  contentWidthCustom?: string
}
