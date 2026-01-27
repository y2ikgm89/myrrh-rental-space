'use client'

/**
 * ページエディター専用フック
 *
 * PageFormDataに特化した型安全なフック
 * 型アサーション完全排除
 */

import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'
import { updatePage } from '@/admin/actions/page'
import type { PageData } from '@/shared/lib/validations/page'
import { usePreview } from '@/admin/hooks'
import { logger } from '@/shared/lib/logger'
import type { PagePreviewData } from '@/shared/types'

// 共有ユーティリティ
import {
  useEditorCore,
  toFormDateString,
  toFormString,
  toFormContentWidth,
  toFormNumberString,
  toFormNullableBoolean,
  toUndefinedString,
  toSubmitDate,
  toSubmitContentWidthUndefined,
  toSubmitNumberUndefined,
} from './shared'

// =============================================================================
// Types & Schema
// =============================================================================

const pageFormSchema = z.object({
  title: z.string().min(1, { message: 'タイトルは必須です' }).max(200, { message: 'タイトルは200文字以内です' }),
  description: z.string().max(500, { message: '説明は500文字以内です' }),
  content: z.string().min(1, { message: 'コンテンツは必須です' }).max(500000, { message: 'コンテンツは500,000文字以内です' }),
  metaDescription: z.string().max(160, { message: 'メタディスクリプションは160文字以内です' }),
  metaKeywords: z.string().max(200, { message: 'メタキーワードは200文字以内です' }),
  ogpTitle: z.string().max(100, { message: 'OGPタイトルは100文字以内です' }),
  ogpDescription: z.string().max(200, { message: 'OGP説明は200文字以内です' }),
  ogpImageUrl: z.union([z.string().url({ message: '有効なURLを入力してください' }), z.literal('')]),
  isPublished: z.boolean(),
  publishedAt: z.string(),
  contentWidth: z.string(),
  contentWidthCustom: z.string(),
  showSidebar: z.boolean().nullable(),
})

/** Page用フォームデータ型（Zodスキーマから推論） */
type PageFormData = z.infer<typeof pageFormSchema>

type UsePageEditorOptions = {
  page: PageData
}

// =============================================================================
// Transforms (Type-safe)
// =============================================================================

function toFormData(data: PageData): PageFormData {
  return {
    title: data.title,
    description: toFormString(data.description),
    content: data.content,
    metaDescription: toFormString(data.metaDescription),
    metaKeywords: toFormString(data.metaKeywords),
    ogpTitle: toFormString(data.ogpTitle),
    ogpDescription: toFormString(data.ogpDescription),
    ogpImageUrl: toFormString(data.ogpImageUrl),
    isPublished: data.isPublished,
    publishedAt: toFormDateString(data.publishedAt),
    contentWidth: toFormContentWidth(data.contentWidth),
    contentWidthCustom: toFormNumberString(data.contentWidthCustom),
    showSidebar: toFormNullableBoolean(data.showSidebar),
  }
}

function toSubmitPayload(formData: PageFormData) {
  return {
    title: formData.title,
    description: toUndefinedString(formData.description),
    content: formData.content,
    metaDescription: toUndefinedString(formData.metaDescription),
    metaKeywords: toUndefinedString(formData.metaKeywords),
    ogpTitle: toUndefinedString(formData.ogpTitle),
    ogpDescription: toUndefinedString(formData.ogpDescription),
    ogpImageUrl: toUndefinedString(formData.ogpImageUrl),
    isPublished: formData.isPublished,
    publishedAt: toSubmitDate(formData.publishedAt),
    contentWidth: toSubmitContentWidthUndefined(formData.contentWidth),
    contentWidthCustom: toSubmitNumberUndefined(formData.contentWidthCustom),
    showSidebar: formData.showSidebar,
  }
}

function toPreviewData(formData: PageFormData, page: PageData): PagePreviewData {
  return {
    title: formData.title || '無題',
    slug: page.slug,
    description: formData.description || null,
    content: formData.content || '',
    showSidebar: formData.showSidebar ?? false,
  }
}

// =============================================================================
// Hook
// =============================================================================

export function usePageEditor({ page }: UsePageEditorOptions) {
  const router = useRouter()

  // プレビュー
  const { saveAndOpenPreview } = usePreview('page')

  // フォーム（型アサーション不要）
  const form = useForm<PageFormData>({
    resolver: zodResolver(pageFormSchema),
    defaultValues: toFormData(page),
  })

  // コアフック
  const core = useEditorCore({
    form,
    listPath: '/admin/pages',
  })

  const { handleSubmit, setValue, getValues, reset, formState, control } = form

  // 監視値（型アサーション不要 - 具体的な型が推論される）
  const title = useWatch({ control, name: 'title' }) ?? ''
  const content = useWatch({ control, name: 'content' }) ?? ''
  const isPublished = useWatch({ control, name: 'isPublished' }) ?? false

  // isDirty計算
  const isDirty = formState.isDirty || core.hasEditorChanges

  // ==========================================================================
  // Handlers (React Compiler auto-memoizes - no useCallback needed)
  // ==========================================================================

  const handleContentChange = (html: string) => {
    setValue('content', html, { shouldDirty: true })
    core.setHasEditorChanges(true)
  }

  const onSubmit = (formData: PageFormData) => {
    core.startTransition(async () => {
      try {
        const payload = toSubmitPayload(formData)
        // PageはslugでupdateするがAPIはidを受け付ける設計
        const result = await updatePage(page.slug, payload)
        if (result.success) {
          reset(formData)
          core.setHasEditorChanges(false)
          router.refresh()
          toast.success(result.message)
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        logger.error('保存中にエラーが発生しました', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error('保存中にエラーが発生しました')
      }
    })
  }

  const handleSave = () => {
    if (core.isPending) return
    handleSubmit(onSubmit)()
  }

  const handlePreview = () => {
    const values = getValues()
    const previewData = toPreviewData(values, page)
    saveAndOpenPreview(page.slug, previewData, '/p')
  }

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    // フォーム
    form,
    isPending: core.isPending,
    isDirty,
    hasEditorChanges: core.hasEditorChanges,

    // 監視値
    title,
    slug: page.slug, // Pageはslug編集不可
    content,
    isPublished,

    // パネル管理
    isSettingsPanelOpen: core.panels.isSettingsPanelOpen,
    isCommentsPanelOpen: core.panels.isCommentsPanelOpen,
    isPanelOpen: core.panels.isSettingsPanelOpen || core.panels.isCommentsPanelOpen,
    toggleSettings: core.panels.toggleSettings,
    toggleComments: core.panels.toggleComments,
    closePanel: core.panels.closePanel,
    activeMarkId: core.panels.activeMarkId,
    selectMark: core.panels.selectMark,
    pendingComment: core.panels.pendingComment,
    handleAddComment: core.panels.handleAddComment,
    clearPendingComment: core.panels.clearPendingComment,

    // ハンドラー
    handleSave,
    handlePreview,
    handleBack: core.handleBack,
    handleContentChange,
    onSubmit,
  }
}
