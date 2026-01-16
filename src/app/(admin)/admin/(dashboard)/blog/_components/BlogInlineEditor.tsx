'use client'

/**
 * ブログインラインエディター
 *
 * Lexicalリッチテキストエディターを使用したブログ記事編集UI
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
} from '@/components/admin/editor/inline'

const LexicalEditor = dynamic(
  () => import('@/components/admin/editor/lexical').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)
import { BlogSidePanel } from '@/components/admin/editor/inline/BlogSidePanel'
import {
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  publishBlogPost,
  unpublishBlogPost,
} from '@/actions/admin/blog'
import type { BlogPostData, BlogCategoryData } from '@/actions/admin/blog'
import type { BlogCategoryOption } from '@/components/admin/editor/inline/types'
import { BlogPostStatus } from '@/generated/prisma/client/enums'
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
import { EDITOR_PROSE_CLASSES } from '@/lib/styles/prose'

// =============================================================================
// Schema
// =============================================================================

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
  status: z.nativeEnum(BlogPostStatus),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// =============================================================================
// Types
// =============================================================================

type BlogInlineEditorProps = {
  post?: BlogPostData
  categories: BlogCategoryData[]
  mode?: 'create' | 'edit'
}

// =============================================================================
// Component
// =============================================================================

export function BlogInlineEditor({ post, categories, mode = 'edit' }: BlogInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [hasEditorChanges, setHasEditorChanges] = useState(false)

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
  } = useForm<FormData>({
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
          status: post.status,
          publishedAt: post.publishedAt
            ? format(new Date(post.publishedAt), "yyyy-MM-dd'T'HH:mm")
            : '',
          contentWidth: post.contentWidth ?? '',
          contentWidthCustom: post.contentWidthCustom?.toString() ?? '',
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
          status: BlogPostStatus.DRAFT,
          publishedAt: '',
          contentWidth: '',
          contentWidthCustom: '',
        },
  })

  const title = useWatch({ control, name: 'title' })
  const slug = useWatch({ control, name: 'slug' })
  const status = useWatch({ control, name: 'status' })
  const content = useWatch({ control, name: 'content' })

  const handleHtmlChange = (html: string) => {
    setValue('content', html, { shouldDirty: true })
    setHasEditorChanges(true)
  }

  const onSubmit = (data: FormData) => {
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
          contentWidth: (data.contentWidth || null) as 'XS' | 'SM' | 'MD' | 'LG' | 'XL' | 'FULL' | 'CUSTOM' | null,
          contentWidthCustom: data.contentWidthCustom
            ? parseInt(data.contentWidthCustom, 10)
            : null,
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
            setHasEditorChanges(false)
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
  }

  const handleSave = () => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }

  const handlePublish = () => {
    if (!post || isPending) return
    startTransition(async () => {
      const result = await publishBlogPost(post.id)
      if (result.success) {
        toast.success(result.message)
        setValue('status', BlogPostStatus.PUBLISHED)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    if (!post || isPending) return
    startTransition(async () => {
      const result = await unpublishBlogPost(post.id)
      if (result.success) {
        toast.success(result.message)
        setValue('status', BlogPostStatus.DRAFT)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handlePreview = () => {
    if (mode === 'create') {
      toast.info('記事を作成後にプレビューできます')
      return
    }
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    window.open(`/blog/${slug}`, '_blank')
  }

  const handleBack = () => {
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/blog')
  }

  const handleToggleSidePanel = () => {
    setIsSidePanelOpen((prev) => !prev)
  }

  const handleCloseSidePanel = () => {
    setIsSidePanelOpen(false)
  }

  const handleDelete = () => {
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
            slug={`blog/${slug}`}
            isDirty={isFormDirty}
            isPending={isPending}
            isSidePanelOpen={isSidePanelOpen}
            onToggleSidePanel={handleToggleSidePanel}
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
            publishActions={
              mode === 'edit' && post
                ? {
                    status,
                    onPublish: handlePublish,
                    onUnpublish: handleUnpublish,
                  }
                : undefined
            }
            extraActions={
              mode === 'edit' && post ? (
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
