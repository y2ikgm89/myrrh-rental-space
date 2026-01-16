/**
 * エディターサイドパネル型定義
 */

import type { ReactNode } from 'react'
import type {
  UseFormRegister,
  Control,
  FieldErrors,
  UseFormSetValue,
  UseFormGetValues,
  FieldValues,
} from 'react-hook-form'

/** パネル幅バリエーション */
export type PanelWidth = 'sm' | 'md' | 'lg'

/** タブ定義 */
export type PanelTab = {
  id: string
  label: string
  icon?: ReactNode
}

/** GenericSidePanelプロパティ */
export type GenericSidePanelProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  width?: PanelWidth
  tabs: PanelTab[]
  defaultTab?: string
  renderTabContent: (tabId: string) => ReactNode
  disabled?: boolean
  className?: string
}

/** フォームプロパティ（共通化） */
export type SidePanelFormProps<T extends FieldValues> = {
  register: UseFormRegister<T>
  control: Control<T>
  errors: FieldErrors<T>
  setValue?: UseFormSetValue<T>
  getValues?: UseFormGetValues<T>
  disabled?: boolean
}

/** Blog編集パネル用フォームデータ */
export type BlogPanelFormData = {
  title: string
  slug: string
  excerpt: string
  thumbnailUrl: string
  ogpImageUrl?: string
  categoryId: string
  tags?: string
  metaDescription?: string
  metaKeywords?: string
  ogpTitle?: string
  ogpDescription?: string
  isPublished: boolean
  publishedAt?: string
  contentWidth?: string
  contentWidthCustom?: string
}

/** News編集パネル用フォームデータ */
export type NewsPanelFormData = {
  title: string
  isPublished: boolean
  publishedAt?: string
  contentWidth?: string
  contentWidthCustom?: string
}

/** Page編集パネル用フォームデータ */
export type PagePanelFormData = {
  title: string
  slug: string
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
}
