'use client'

/**
 * ブログインラインエディター
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
import { BlogSidePanel } from '@/components/admin/editor/inline/BlogSidePanel'
import { createBlogPost, updateBlogPost, deleteBlogPost } from '@/actions/admin/blog'
import type { BlogPostData, BlogCategoryData } from '@/actions/admin/blog'
import type { BlogEditorFormData, BlogCategoryOption } from '@/components/admin/editor/inline/types'
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
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(200).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  excerpt: z.string().min(1, '抜粋は必須です').max(500, '抜粋は500文字以内'),
  content: z.string().min(1, '本文は必須です'),
  thumbnailUrl: z.string().min(1, 'サムネイルURLは必須です'),
  ogpImageUrl: z.string().optional(),
  categoryId: z.string().min(1, 'カテゴリを選択してください'),
  tags: z.string().optional(),
  metaDescription: z.string().max(160).optional(),
  metaKeywords: z.string().optional(),
  ogpTitle: z.string().max(60).optional(),
  ogpDescription: z.string().max(160).optional(),
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
})

type BlogInlineEditorProps = {
  post?: BlogPostData
  categories: BlogCategoryData[]
  mode?: 'create' | 'edit'
}

export function BlogInlineEditor({ post, categories, mode = 'edit' }: BlogInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const categoryOptions: BlogCategoryOption[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
  }))

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<BlogEditorFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: post
      ? {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          thumbnailUrl: post.thumbnailUrl,
          ogpImageUrl: post.ogpImageUrl ?? '',
          categoryId: post.categoryId,
          tags: post.tags?.join(', ') ?? '',
          metaDescription: post.metaDescription ?? '',
          metaKeywords: post.metaKeywords ?? '',
          ogpTitle: post.ogpTitle ?? '',
          ogpDescription: post.ogpDescription ?? '',
          isPublished: post.isPublished,
          publishedAt: post.publishedAt
            ? format(new Date(post.publishedAt), "yyyy-MM-dd'T'HH:mm")
            : '',
        }
      : {
          title: '',
          slug: '',
          excerpt: '',
          content: '',
          thumbnailUrl: '/images/placeholder.jpg',
          ogpImageUrl: '',
          categoryId: categories[0]?.id ?? '',
          tags: '',
          metaDescription: '',
          metaKeywords: '',
          ogpTitle: '',
          ogpDescription: '',
          isPublished: false,
          publishedAt: '',
        },
  })

  const title = useWatch({ control, name: 'title' })
  const content = useWatch({ control, name: 'content' })
  const slug = useWatch({ control, name: 'slug' })

  const onSubmit = useCallback(
    (data: BlogEditorFormData) => {
      startTransition(async () => {
        try {
          const tags = data.tags
            ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : []

          const payload = {
            title: data.title,
            slug: data.slug,
            excerpt: data.excerpt,
            content: data.content,
            thumbnailUrl: data.thumbnailUrl,
            ogpImageUrl: data.ogpImageUrl || null,
            categoryId: data.categoryId,
            tags,
            metaDescription: data.metaDescription || null,
            metaKeywords: data.metaKeywords || null,
            ogpTitle: data.ogpTitle || null,
            ogpDescription: data.ogpDescription || null,
            isPublished: data.isPublished,
            publishedAt: data.publishedAt || null,
          }

          if (mode === 'create') {
            const result = await createBlogPost(payload)
            if (result.success) {
              toast.success('記事を作成しました')
              router.push(`/admin/blog/${result.data.id}`)
            } else {
              toast.error(result.error)
            }
          } else if (post) {
            const result = await updateBlogPost(post.id, payload)
            if (result.success) {
              reset(data)
              router.refresh()
              toast.success('記事を保存しました')
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
    [mode, post, router, reset]
  )

  const handleSave = useCallback(() => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }, [handleSubmit, onSubmit, isPending])

  const handlePreview = useCallback(() => {
    if (mode === 'create') {
      toast.info('記事を作成後にプレビューできます')
      return
    }
    if (isDirty) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    window.open(`/blog/${slug}`, '_blank')
  }, [mode, slug, isDirty])

  const handleBack = useCallback(() => {
    if (isDirty && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/blog')
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
    if (!post) return
    startTransition(async () => {
      try {
        const result = await deleteBlogPost(post.id)
        if (result.success) {
          toast.success('記事を削除しました')
          router.push('/admin/blog')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        console.error('削除中にエラーが発生しました:', error)
        toast.error('削除中にエラーが発生しました')
      }
    })
  }, [post, router])

  useKeyboardShortcuts({ onSave: handleSave })
  useBeforeUnload({ isDirty })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="h-screen">
      <InlineEditorLayout>
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-background px-4 py-2">
            <EditorHeader
              title={title}
              slug={`blog/${slug}`}
              isDirty={isDirty}
              isPending={isPending}
              isSidePanelOpen={isSidePanelOpen}
              onToggleSidePanel={handleToggleSidePanel}
              onSave={handleSave}
              onPreview={handlePreview}
              onBack={handleBack}
            />

            {mode === 'edit' && post && (
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
                    <DialogTitle>ブログ記事を削除しますか？</DialogTitle>
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

        <BlogSidePanel
          isOpen={isSidePanelOpen}
          onClose={handleCloseSidePanel}
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          getValues={getValues}
          categories={categoryOptions}
          disabled={isPending}
        />
      </InlineEditorLayout>
    </form>
  )
}
