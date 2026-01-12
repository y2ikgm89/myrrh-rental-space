'use client'

/**
 * お知らせインラインエディター
 *
 * Webflow型のフルページ編集UI
 * 公開ページと同じ見た目でコンテンツを編集
 * 新規作成・編集の両方に対応
 */

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  InlineEditorLayout,
  EditorHeader,
  EditorCanvas,
  useKeyboardShortcuts,
  useBeforeUnload,
} from '@/components/admin/editor/inline'
import { NewsSidePanel } from '@/components/admin/editor/inline/NewsSidePanel'
import { createNews, updateNews, deleteNews } from '@/actions/admin/news'
import type { NewsData } from '@/actions/admin/news'
import type { NewsEditorFormData } from '@/components/admin/editor/inline/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/admin/ui'

const formSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
})

type NewsInlineEditorProps = {
  news?: NewsData
  mode?: 'create' | 'edit'
}

export function NewsInlineEditor({ news, mode = 'edit' }: NewsInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<NewsEditorFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: news
      ? {
          title: news.title,
          content: news.content,
          isPublished: news.isPublished,
          publishedAt: news.publishedAt
            ? format(new Date(news.publishedAt), "yyyy-MM-dd'T'HH:mm")
            : '',
        }
      : {
          title: '',
          content: '',
          isPublished: false,
          publishedAt: '',
        },
  })

  const title = useWatch({ control, name: 'title' })
  const content = useWatch({ control, name: 'content' })

  const onSubmit = useCallback(
    (data: NewsEditorFormData) => {
      startTransition(async () => {
        try {
          const payload = {
            title: data.title,
            content: data.content,
            isPublished: data.isPublished,
            publishedAt: data.publishedAt || null,
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
    },
    [mode, news, router, reset]
  )

  const handleSave = useCallback(() => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }, [handleSubmit, onSubmit, isPending])

  const handlePreview = useCallback(() => {
    if (mode === 'create') {
      toast.info('お知らせを作成後にプレビューできます')
      return
    }
    if (isDirty) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    if (news) {
      window.open(`/news/${news.id}`, '_blank')
    }
  }, [mode, news, isDirty])

  const handleBack = useCallback(() => {
    if (isDirty && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/news')
  }, [router, isDirty])

  const handleToggleSidePanel = useCallback(() => {
    setIsSidePanelOpen((prev) => !prev)
  }, [])

  const handleCloseSidePanel = useCallback(() => {
    setIsSidePanelOpen(false)
  }, [])

  const handleContentChange = useCallback(
    (html: string) => {
      setValue('content', html, { shouldDirty: true })
    },
    [setValue]
  )

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setValue('title', newTitle, { shouldDirty: true })
    },
    [setValue]
  )

  const handleDelete = useCallback(() => {
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
  }, [news, router])

  useKeyboardShortcuts({ onSave: handleSave })
  useBeforeUnload({ isDirty })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="h-screen">
      <InlineEditorLayout>
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-background px-4 py-2">
            <EditorHeader
              title={title}
              slug={news ? `news/${news.id}` : 'news/new'}
              isDirty={isDirty}
              isPending={isPending}
              isSidePanelOpen={isSidePanelOpen}
              onToggleSidePanel={handleToggleSidePanel}
              onSave={handleSave}
              onPreview={handlePreview}
              onBack={handleBack}
            />

            {mode === 'edit' && news && (
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
                      {isPending ? '削除中...' : '削除する'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <EditorCanvas
            title={title}
            onTitleChange={handleTitleChange}
            showTitle={true}
            content={content}
            onChange={handleContentChange}
            disabled={isPending}
          />
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
