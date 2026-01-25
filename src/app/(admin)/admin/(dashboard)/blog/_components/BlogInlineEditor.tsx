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
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
  useEditorPanels,
  UnifiedSidePanel,
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
      <div className="h-[500px] flex items-center justify-center border rounded-lg bg-muted/50">
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
    const slug = generateSlug(name, 'category')

    const result = await createBlogCategory({
      name,
      slug,
      description: null,
      order: currentCategories.length,
    })

    if (result.success && result.data) {
      const now = new Date()
      const newCategory: BlogCategoryData = {
        id: result.data.id,
        name,
        slug,
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
    const slug = generateSlug(name, 'tag')

    const result = await createBlogTag({ name, slug })

    if (result.success && result.data) {
      const now = new Date()
      const newTag: BlogTagData = {
        id: result.data.id,
        name,
        slug,
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

  useFullscreenMode()
  useKeyboardShortcuts({ onSave: handleSave })
  useBeforeUnload({ isDirty: isDirty || hasEditorChanges })

  const isFormDirty = isDirty || hasEditorChanges

  // パネルの開閉状態（排他的なので常に1つのみ）
  const isPanelOpen = isSettingsPanelOpen || isCommentsPanelOpen

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="h-screen flex">
      <div
        className="flex flex-1 flex-col overflow-hidden transition-[margin] duration-300"
        style={{ marginRight: isPanelOpen ? '320px' : '0' }}
      >
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

          {/* Lexical Editor */}
          <div className="flex-1 overflow-auto p-4">
            <LexicalEditor
              content={content}
              onChange={handleHtmlChange}
              disabled={isPending}
              className={EDITOR_PROSE_CLASSES}
              showToolbar
              height="calc(100vh - 200px)"
              onMarkClick={mode === 'edit' && post ? selectMark : undefined}
              onAddComment={mode === 'edit' && post ? handleAddComment : undefined}
            />
          </div>
        </div>

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
          // カテゴリ
          categories: categoryOptions,
          onCreateCategory: handleCreateCategory,
          // タグ
          availableTags: tagOptions,
          onCreateTag: handleCreateTag,
          // 公開設定
          statusValue: status,
          onStatusChange: (value: string) => {
            if (isValidBlogPostStatus(value)) {
              setValue('status', value)
            }
          },
        }}
      />

      {/* コメントパネル（編集モードのみ） */}
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
    </form>
  )
}
