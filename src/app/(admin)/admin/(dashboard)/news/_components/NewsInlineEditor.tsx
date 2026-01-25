'use client'

/**
 * お知らせインラインエディター
 *
 * Lexicalリッチテキストエディターを使用したお知らせ編集UI
 * 新規作成・編集の両方に対応
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import {
  EditorHeader,
  useEditorPanels,
  UnifiedSidePanel,
  InlineEditorShell,
} from '@/admin/components/editor/inline'
import { CommentPanel } from '@/admin/components/editor/comment-panel'
import { newsContentTypeConfig } from '@/admin/components/editor/inline/content-types/news-config'
import {
  newsFormSchema,
  type NewsFormData,
  type NewsData,
} from '@/admin/lib/validations/news'

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
import {
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
} from '@/admin/actions/news'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/admin/components/ui'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { logger } from '@/shared/lib/logger'
import { usePreview } from '@/admin/hooks'
import type { NewsPreviewData } from '@/shared/types'
import type { NewsEditorFormData } from '@/admin/components/editor/inline/types'

type FormData = NewsFormData & NewsEditorFormData

// =============================================================================
// Types
// =============================================================================

type NewsInlineEditorProps = {
  news?: NewsData
  mode?: 'create' | 'edit'
}

// =============================================================================
// Component
// =============================================================================

export function NewsInlineEditor({ news, mode = 'edit' }: NewsInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [hasEditorChanges, setHasEditorChanges] = useState(false)

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
  const { saveAndOpenPreview } = usePreview('news')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(newsFormSchema),
    defaultValues: news
      ? {
          slug: news.slug,
          title: news.title,
          content: news.content,
          isPublished: news.isPublished,
          publishedAt: news.publishedAt
            ? format(new Date(news.publishedAt), "yyyy-MM-dd'T'HH:mm")
            : '',
          contentWidth: news.contentWidth ?? '',
          contentWidthCustom: news.contentWidthCustom?.toString() ?? '',
          metaDescription: news.metaDescription ?? '',
          metaKeywords: news.metaKeywords ?? '',
          ogpTitle: news.ogpTitle ?? '',
          ogpDescription: news.ogpDescription ?? '',
          ogpImageUrl: news.ogpImageUrl ?? '',
        }
      : {
          slug: '',
          title: '',
          content: '',
          isPublished: false,
          publishedAt: '',
          contentWidth: '',
          contentWidthCustom: '',
          metaDescription: '',
          metaKeywords: '',
          ogpTitle: '',
          ogpDescription: '',
          ogpImageUrl: '',
        },
  })

  const title = useWatch({ control, name: 'title' })
  const isPublished = useWatch({ control, name: 'isPublished' })
  const content = useWatch({ control, name: 'content' })

  const handleHtmlChange = (html: string) => {
    setValue('content', html, { shouldDirty: true })
    setHasEditorChanges(true)
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const payload = {
          slug: data.slug,
          title: data.title,
          content: data.content,
          contentWidth: (data.contentWidth || null) as 'XS' | 'SM' | 'MD' | 'LG' | 'XL' | 'FULL' | 'CUSTOM' | null,
          contentWidthCustom: data.contentWidthCustom
            ? parseInt(data.contentWidthCustom, 10)
            : null,
          metaDescription: data.metaDescription || null,
          metaKeywords: data.metaKeywords || null,
          ogpTitle: data.ogpTitle || null,
          ogpDescription: data.ogpDescription || null,
          ogpImageUrl: data.ogpImageUrl || null,
        }

        if (mode === 'create') {
          const result = await createNews(payload)
          if (result.success) {
            toast.success('お知らせを作成しました')
            router.push(`/admin/news/${result.data.id}`)
          } else {
            toast.error(result.error)
          }
        } else if (news) {
          const result = await updateNews(news.id, payload)
          if (result.success) {
            reset(data)
            setHasEditorChanges(false)
            router.refresh()
            toast.success('お知らせを保存しました')
          } else {
            toast.error(result.error)
          }
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

  const handlePublish = () => {
    if (!news || isPending) return
    startTransition(async () => {
      const result = await publishNews(news.id)
      if (result.success) {
        toast.success(result.message)
        setValue('isPublished', true)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    if (!news || isPending) return
    startTransition(async () => {
      const result = await unpublishNews(news.id)
      if (result.success) {
        toast.success(result.message)
        setValue('isPublished', false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handlePreview = () => {
    const values = getValues()
    const identifier = mode === 'create' ? 'preview-new' : (values.slug || 'preview-new')

    // プレビューデータを構築
    const previewData: NewsPreviewData = {
      title: values.title || '無題',
      slug: identifier,
      content: values.content || '',
      publishedAt: values.publishedAt || null,
    }

    // プレビューを開く
    saveAndOpenPreview(identifier, previewData, '/news')
  }

  const handleBack = () => {
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/news')
  }

  const handleDelete = () => {
    if (!news) return
    startTransition(async () => {
      try {
        const result = await deleteNews(news.id)
        if (result.success) {
          toast.success('お知らせを削除しました')
          router.push('/admin/news')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        logger.error('削除中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('削除中にエラーが発生しました')
      }
    })
  }

  const isFormDirty = isDirty || hasEditorChanges
  const isPanelOpen = isSettingsPanelOpen || isCommentsPanelOpen

  return (
    <InlineEditorShell
      onSubmit={handleSubmit(onSubmit)}
      onSave={handleSave}
      isDirty={isFormDirty}
      isPanelOpen={isPanelOpen}
      header={
        <EditorHeader
          title={title}
          slug={news ? `news/${news.slug}` : 'news/new'}
          isDirty={isFormDirty}
          isPending={isPending}
          isSidePanelOpen={isSettingsPanelOpen}
          onToggleSidePanel={toggleSettings}
          onSave={handleSave}
          onPreview={handlePreview}
          onBack={handleBack}
          publishActions={
            mode === 'edit' && news
              ? {
                  status: isPublished,
                  onPublish: handlePublish,
                  onUnpublish: handleUnpublish,
                }
              : undefined
          }
          showCommentButton={mode === 'edit' && !!news}
          isCommentPanelOpen={isCommentsPanelOpen}
          onToggleCommentPanel={toggleComments}
          extraActions={
            mode === 'edit' && news ? (
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isPending}
                  >
                    削除
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>お知らせを削除しますか？</DialogTitle>
                    <DialogDescription>
                      この操作は取り消せません。本当に削除してもよろしいですか？
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsDeleteDialogOpen(false)}
                      disabled={isPending}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isPending}
                    >
                      {isPending ? '削除中...' : '削除'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : undefined
          }
        />
      }
      panel={
        <>
          <UnifiedSidePanel
            isOpen={isSettingsPanelOpen}
            onClose={closePanel}
            config={newsContentTypeConfig}
            register={register}
            control={control}
            errors={errors}
            setValue={setValue}
            getValues={getValues}
            disabled={isPending}
            extraProps={{
              isPublishedValue: isPublished,
              onIsPublishedChange: (value: boolean) => setValue('isPublished', value),
            }}
          />
          {mode === 'edit' && news && (
            <CommentPanel
              isOpen={isCommentsPanelOpen}
              contentType="news"
              contentId={news.id}
              activeMarkId={activeMarkId}
              onClose={closePanel}
              pendingComment={pendingComment}
              onPendingCommentSubmit={clearPendingComment}
            />
          )}
        </>
      }
    >
      <LexicalEditor
        content={content}
        onChange={handleHtmlChange}
        disabled={isPending}
        className={EDITOR_PROSE_CLASSES}
        showToolbar
        height="100%"
        onMarkClick={mode === 'edit' && news ? selectMark : undefined}
        onAddComment={mode === 'edit' && news ? handleAddComment : undefined}
      />
    </InlineEditorShell>
  )
}
