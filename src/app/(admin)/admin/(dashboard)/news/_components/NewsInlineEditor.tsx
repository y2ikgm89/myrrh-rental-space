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
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import {
  InlineEditorLayout,
  EditorHeader,
  useKeyboardShortcuts,
  useBeforeUnload,
} from '@/admin/components/editor/inline'

const LexicalEditor = dynamic(
  () => import('@/admin/components/editor/lexical').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)
import { NewsSidePanel } from '@/admin/components/editor/inline/NewsSidePanel'
import {
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
} from '@/admin/actions/news'
import type { NewsData } from '@/admin/actions/news'
import { NewsStatus } from '@/shared/generated/prisma/enums'
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

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
  status: z.nativeEnum(NewsStatus),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

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
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [hasEditorChanges, setHasEditorChanges] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: news
      ? {
          title: news.title,
          content: news.content,
          status: news.status,
          publishedAt: news.publishedAt
            ? format(new Date(news.publishedAt), "yyyy-MM-dd'T'HH:mm")
            : '',
          contentWidth: news.contentWidth ?? '',
          contentWidthCustom: news.contentWidthCustom?.toString() ?? '',
        }
      : {
          title: '',
          content: '',
          status: NewsStatus.DRAFT,
          publishedAt: '',
          contentWidth: '',
          contentWidthCustom: '',
        },
  })

  const title = useWatch({ control, name: 'title' })
  const status = useWatch({ control, name: 'status' })
  const content = useWatch({ control, name: 'content' })

  const handleHtmlChange = (html: string) => {
    setValue('content', html, { shouldDirty: true })
    setHasEditorChanges(true)
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const payload = {
          title: data.title,
          content: data.content,
          contentWidth: (data.contentWidth || null) as 'XS' | 'SM' | 'MD' | 'LG' | 'XL' | 'FULL' | 'CUSTOM' | null,
          contentWidthCustom: data.contentWidthCustom
            ? parseInt(data.contentWidthCustom, 10)
            : null,
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
        console.error('保存中にエラーが発生しました:', error)
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
        setValue('status', NewsStatus.PUBLISHED)
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
        setValue('status', NewsStatus.DRAFT)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handlePreview = () => {
    if (mode === 'create') {
      toast.info('お知らせを作成後にプレビューできます')
      return
    }
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    if (news) {
      window.open(`/news/${news.id}`, '_blank')
    }
  }

  const handleBack = () => {
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/news')
  }

  const handleToggleSidePanel = () => {
    setIsSidePanelOpen((prev) => !prev)
  }

  const handleCloseSidePanel = () => {
    setIsSidePanelOpen(false)
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
        console.error('削除中にエラーが発生しました:', error)
        toast.error('削除中にエラーが発生しました')
      }
    })
  }

  useKeyboardShortcuts({ onSave: handleSave })
  useBeforeUnload({ isDirty: isDirty || hasEditorChanges })

  const isFormDirty = isDirty || hasEditorChanges

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="h-screen">
      <InlineEditorLayout>
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorHeader
            title={title}
            slug={news ? `news/${news.id}` : 'news/new'}
            isDirty={isFormDirty}
            isPending={isPending}
            isSidePanelOpen={isSidePanelOpen}
            onToggleSidePanel={handleToggleSidePanel}
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
            publishActions={
              mode === 'edit' && news
                ? {
                    status,
                    onPublish: handlePublish,
                    onUnpublish: handleUnpublish,
                  }
                : undefined
            }
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

          {/* Lexical Editor */}
          <div className="flex-1 overflow-auto p-4">
            <LexicalEditor
              content={content}
              onChange={handleHtmlChange}
              disabled={isPending}
              className={EDITOR_PROSE_CLASSES}
              showToolbar
              minHeight="calc(100vh - 200px)"
            />
          </div>
        </div>

        <NewsSidePanel
          isOpen={isSidePanelOpen}
          onClose={handleCloseSidePanel}
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          disabled={isPending}
        />
      </InlineEditorLayout>
    </form>
  )
}
