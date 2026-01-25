'use client'

/**
 * ページインラインエディター
 *
 * Webflow型のフルページ編集UI
 * 公開ページと同じ見た目でコンテンツを編集
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import {
  EditorHeader,
  UnifiedSidePanel,
  useEditorPanels,
  InlineEditorShell,
} from '@/admin/components/editor/inline'
import { CommentPanel } from '@/admin/components/editor/comment-panel'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'

const LexicalEditor = dynamic(
  () => import('@/admin/components/editor/lexical').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)
import { pageContentTypeConfig } from '@/admin/components/editor/inline/content-types/page-config'
import { updatePage } from '@/admin/actions/page'
import type { PageData } from '@/admin/lib/validations/page'
import { logger } from '@/shared/lib/logger'
import { usePreview } from '@/admin/hooks'
import type { PagePreviewData } from '@/shared/types'

/**
 * フォーム用スキーマ（Lexicalエディター用）
 */
const formSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  content: z.string().min(1, 'コンテンツは必須です').max(500000, 'コンテンツは500,000文字以内です'),
  metaDescription: z.string().max(160, 'メタディスクリプションは160文字以内です').optional(),
  metaKeywords: z.string().max(200, 'メタキーワードは200文字以内です').optional(),
  ogpTitle: z.string().max(100, 'OGPタイトルは100文字以内です').optional(),
  ogpDescription: z.string().max(200, 'OGP説明は200文字以内です').optional(),
  ogpImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
  showSidebar: z.boolean().nullable().optional(),
})

type FormData = z.infer<typeof formSchema>

type PageInlineEditorProps = {
  page: PageData
}

export function PageInlineEditor({ page }: PageInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 排他的パネル管理（設定/コメント）
  const {
    isSettingsPanelOpen,
    isCommentsPanelOpen,
    toggleSettings,
    toggleComments,
    closePanel,
    activeMarkId,
    selectMark,
    pendingComment,
    handleAddComment,
    clearPendingComment,
  } = useEditorPanels()

  // プレビュー機能
  const { saveAndOpenPreview } = usePreview('page')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: page.title,
      description: page.description ?? '',
      content: page.content,
      metaDescription: page.metaDescription ?? '',
      metaKeywords: page.metaKeywords ?? '',
      ogpTitle: page.ogpTitle ?? '',
      ogpDescription: page.ogpDescription ?? '',
      ogpImageUrl: page.ogpImageUrl ?? '',
      isPublished: page.isPublished,
      publishedAt: page.publishedAt
        ? format(new Date(page.publishedAt), "yyyy-MM-dd'T'HH:mm")
        : '',
      contentWidth: page.contentWidth ?? '',
      contentWidthCustom: page.contentWidthCustom?.toString() ?? '',
      showSidebar: page.showSidebar,
    },
  })

  const title = useWatch({ control, name: 'title' })
  const content = useWatch({ control, name: 'content' })
  const isPublished = useWatch({ control, name: 'isPublished' })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const result = await updatePage(page.slug, {
          title: data.title,
          description: data.description,
          content: data.content,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          ogpTitle: data.ogpTitle,
          ogpDescription: data.ogpDescription,
          ogpImageUrl: data.ogpImageUrl,
          isPublished: data.isPublished,
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
          contentWidth: (data.contentWidth || undefined) as 'XS' | 'SM' | 'MD' | 'LG' | 'CUSTOM' | undefined,
          contentWidthCustom: data.contentWidthCustom ? parseInt(data.contentWidthCustom, 10) : undefined,
          showSidebar: data.showSidebar,
        })

        if (result.success) {
          reset(data)
          router.refresh()
          toast.success('ページを保存しました')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        logger.error('保存中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('保存中にエラーが発生しました')
      }
    })
  }

  const handleSave = () => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }

  const handlePreview = () => {
    const values = getValues()
    const identifier = page.slug

    // プレビューデータを構築
    const previewData: PagePreviewData = {
      title: values.title || '無題',
      slug: identifier,
      description: values.description || null,
      content: values.content || '',
      showSidebar: values.showSidebar ?? false,
    }

    // プレビューを開く
    saveAndOpenPreview(identifier, previewData, '/p')
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/pages')
  }

  const handleContentChange = (html: string) => {
    setValue('content', html, { shouldDirty: true })
  }

  const isPanelOpen = isSettingsPanelOpen || isCommentsPanelOpen

  return (
    <InlineEditorShell
      onSubmit={handleSubmit(onSubmit)}
      onSave={handleSave}
      isDirty={isDirty}
      isPanelOpen={isPanelOpen}
      header={
        <EditorHeader
          title={title}
          slug={page.slug}
          isDirty={isDirty}
          isPending={isPending}
          isSidePanelOpen={isSettingsPanelOpen}
          onToggleSidePanel={toggleSettings}
          onSave={handleSave}
          onPreview={handlePreview}
          onBack={handleBack}
          showCommentButton
          isCommentPanelOpen={isCommentsPanelOpen}
          onToggleCommentPanel={toggleComments}
        />
      }
      panel={
        <>
          <UnifiedSidePanel
            isOpen={isSettingsPanelOpen}
            onClose={closePanel}
            config={pageContentTypeConfig}
            register={register}
            control={control}
            errors={errors}
            setValue={setValue}
            disabled={isPending}
            extraProps={{
              isPublishedValue: isPublished,
              onIsPublishedChange: (value: boolean) => setValue('isPublished', value),
            }}
          />
          <CommentPanel
            isOpen={isCommentsPanelOpen}
            contentType="page"
            contentId={page.id}
            activeMarkId={activeMarkId}
            onClose={closePanel}
            pendingComment={pendingComment}
            onPendingCommentSubmit={clearPendingComment}
          />
        </>
      }
    >
      <LexicalEditor
        content={content}
        onChange={handleContentChange}
        disabled={isPending}
        className={EDITOR_PROSE_CLASSES}
        showToolbar
        height="100%"
        onMarkClick={selectMark}
        onAddComment={handleAddComment}
      />
    </InlineEditorShell>
  )
}
