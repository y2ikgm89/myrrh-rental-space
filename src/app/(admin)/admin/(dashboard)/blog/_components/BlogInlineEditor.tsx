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
import { blogContentTypeConfig } from '@/admin/components/editor/inline/content-types/blog-config'
import {
  blogFormSchema,
  type BlogFormData,
  type BlogPostData,
  type BlogCategoryData,
} from '@/admin/lib/validations/blog'
import {
  isValidLayoutWidth,
  isValidBlogPostStatus,
} from '@/shared/lib/validations/enums'

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
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  createBlogCategory,
  createBlogTag,
} from '@/admin/actions/blog'
import type { BlogTagData } from '@/admin/lib/validations/blog'
import type { BlogCategoryOption } from '@/admin/components/editor/inline/types'
import { BlogPostStatus } from '@/shared/generated/prisma/enums'
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
import { generateSlug } from '@/shared/lib/utils'
import { usePreview } from '@/admin/hooks'
import type { BlogPreviewData } from '@/shared/types'

type FormData = BlogFormData

// =============================================================================
// Types
// =============================================================================

type BlogInlineEditorProps = {
  post?: BlogPostData
  categories: BlogCategoryData[]
  tags: BlogTagData[]
  mode?: 'create' | 'edit'
}

// =============================================================================
// Component
// =============================================================================

export function BlogInlineEditor({ post, categories, tags: initialTags, mode = 'edit' }: BlogInlineEditorProps) {
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
  const { saveAndOpenPreview } = usePreview('blog')

  // カテゴリとタグの状態（エディタ内で新規作成した場合に更新）
  const [currentCategories, setCurrentCategories] = useState(categories)
  const [currentTags, setCurrentTags] = useState(initialTags)

  const categoryOptions: BlogCategoryOption[] = currentCategories.map((c) => ({
    id: c.id,
    name: c.name,
  }))

  // タグオプション（TagInput用）
  const tagOptions = currentTags.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    _count: t._count,
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
    resolver: zodResolver(blogFormSchema),
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
          contentWidth: data.contentWidth && isValidLayoutWidth(data.contentWidth) ? data.contentWidth : null,
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
    const values = getValues()
    const identifier = mode === 'create' ? 'preview-new' : (values.slug || 'preview-new')

    // 選択中のカテゴリを取得
    const selectedCategory = currentCategories.find((c) => c.id === values.categoryId)

    // タグをパース
    const tags = values.tags
      ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []

    // プレビューデータを構築
    const previewData: BlogPreviewData = {
      title: values.title || '無題',
      slug: identifier,
      excerpt: values.excerpt || '',
      content: values.content || '',
      thumbnailUrl: values.thumbnailUrl || '/images/placeholder.jpg',
      publishedAt: values.publishedAt || null,
      tags,
      category: {
        name: selectedCategory?.name || 'カテゴリなし',
        slug: selectedCategory?.slug || 'uncategorized',
      },
    }

    // プレビューを開く
    saveAndOpenPreview(identifier, previewData, '/blog')
  }

  const handleBack = () => {
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/blog')
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
        logger.error('削除中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('削除中にエラーが発生しました')
      }
    })
  }

  // カテゴリ作成コールバック
  const handleCreateCategory = async (name: string) => {
    const categorySlug = generateSlug(name, 'category')

    const result = await createBlogCategory({
      name,
      slug: categorySlug,
      description: null,
      order: currentCategories.length,
    })

    if (result.success && result.data) {
      const now = new Date()
      const newCategory: BlogCategoryData = {
        id: result.data.id,
        name,
        slug: categorySlug,
        description: null,
        order: currentCategories.length,
        createdAt: now,
        updatedAt: now,
        _count: { posts: 0 },
      }
      setCurrentCategories((prev) => [...prev, newCategory])
      toast.success('カテゴリを作成しました')
      return { id: newCategory.id, name: newCategory.name, slug: newCategory.slug }
    }
    toast.error(!result.success ? result.error : 'カテゴリの作成に失敗しました')
    return null
  }

  // タグ作成コールバック
  const handleCreateTag = async (name: string) => {
    const tagSlug = generateSlug(name, 'tag')

    const result = await createBlogTag({ name, slug: tagSlug })

    if (result.success && result.data) {
      const now = new Date()
      const newTag: BlogTagData = {
        id: result.data.id,
        name,
        slug: tagSlug,
        createdAt: now,
        updatedAt: now,
        _count: { posts: 0 },
      }
      setCurrentTags((prev) => [...prev, newTag])
      toast.success('タグを作成しました')
      return { id: newTag.id, name: newTag.name, slug: newTag.slug, _count: newTag._count }
    }
    toast.error(!result.success ? result.error : 'タグの作成に失敗しました')
    return null
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
          slug={`blog/${slug}`}
          isDirty={isFormDirty}
          isPending={isPending}
          isSidePanelOpen={isSettingsPanelOpen}
          onToggleSidePanel={toggleSettings}
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
          showCommentButton={mode === 'edit' && !!post}
          isCommentPanelOpen={isCommentsPanelOpen}
          onToggleCommentPanel={toggleComments}
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
            config={blogContentTypeConfig}
            register={register}
            control={control}
            errors={errors}
            setValue={setValue}
            getValues={getValues}
            disabled={isPending}
            extraProps={{
              categories: categoryOptions,
              onCreateCategory: handleCreateCategory,
              availableTags: tagOptions,
              onCreateTag: handleCreateTag,
              statusValue: status,
              onStatusChange: (value: string) => {
                if (isValidBlogPostStatus(value)) {
                  setValue('status', value)
                }
              },
            }}
          />
          {mode === 'edit' && post && (
            <CommentPanel
              isOpen={isCommentsPanelOpen}
              contentType="blog"
              contentId={post.id}
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
        onMarkClick={mode === 'edit' && post ? selectMark : undefined}
        onAddComment={mode === 'edit' && post ? handleAddComment : undefined}
      />
    </InlineEditorShell>
  )
}
