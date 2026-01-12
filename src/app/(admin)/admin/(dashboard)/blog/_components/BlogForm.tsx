'use client'

/**
 * ブログ記事編集フォーム
 *
 * タブベースのレイアウトで視認性・操作性を向上
 * - 本文タブ: エディターのみで広い編集領域
 * - 基本情報タブ: タイトル、スラッグ、抜粋
 * - SEOタブ: メタ情報、OGP設定
 * - 設定タブ: 公開設定、カテゴリ、タグ、画像
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/admin/ui'
import { RichTextEditor } from '@/components/admin/editor'
import { createBlogPost, updateBlogPost, deleteBlogPost } from '@/actions/admin/blog'
import type { BlogPostData, BlogCategoryData } from '@/actions/admin/blog'
import { cn } from '@/lib/utils'

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
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
})

const CONTENT_WIDTH_OPTIONS = [
  { value: '', label: 'デフォルト' },
  { value: 'XS', label: '極小 (640px)' },
  { value: 'SM', label: '小 (768px)' },
  { value: 'MD', label: '中 (1024px)' },
  { value: 'LG', label: '大 (1280px)' },
  { value: 'CUSTOM', label: 'カスタム' },
] as const

type FormData = z.infer<typeof formSchema>

// =============================================================================
// Types
// =============================================================================

type BlogFormProps = {
  post?: BlogPostData
  categories: BlogCategoryData[]
  mode: 'create' | 'edit'
}

// =============================================================================
// Tab Icons
// =============================================================================

const EditIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="m18.5 2.5 2.5 2.5L12 14l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const InfoIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
)

const SearchIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const SettingsIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

// =============================================================================
// Main Component
// =============================================================================

export function BlogForm({ post, categories, mode }: BlogFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('content')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: post?.title ?? '',
      slug: post?.slug ?? '',
      excerpt: post?.excerpt ?? '',
      content: post?.content ?? '',
      thumbnailUrl: post?.thumbnailUrl ?? '/images/placeholder.jpg',
      ogpImageUrl: post?.ogpImageUrl ?? '',
      categoryId: post?.categoryId ?? '',
      tags: post?.tags?.join(', ') ?? '',
      metaDescription: post?.metaDescription ?? '',
      metaKeywords: post?.metaKeywords ?? '',
      ogpTitle: post?.ogpTitle ?? '',
      ogpDescription: post?.ogpDescription ?? '',
      isPublished: post?.isPublished ?? false,
      publishedAt: post?.publishedAt
        ? format(new Date(post.publishedAt), "yyyy-MM-dd'T'HH:mm")
        : '',
      contentWidth: post?.contentWidth ?? '',
      contentWidthCustom: post?.contentWidthCustom?.toString() ?? '',
    },
  })

  const isPublished = useWatch({ control, name: 'isPublished' })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const content = useWatch({ control, name: 'content' })
  const contentWidth = useWatch({ control, name: 'contentWidth' })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
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
        contentWidth: data.contentWidth || null,
        contentWidthCustom: data.contentWidthCustom
          ? parseInt(data.contentWidthCustom, 10)
          : null,
      }

      if (mode === 'create') {
        const result = await createBlogPost(payload)
        if (result.success) {
          router.push(`/admin/blog/${result.data.id}`)
        } else {
          toast.error(result.error)
        }
      } else if (post) {
        const result = await updateBlogPost(post.id, payload)
        if (result.success) {
          router.refresh()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleDelete = () => {
    if (!post) return

    startTransition(async () => {
      const result = await deleteBlogPost(post.id)
      if (result.success) {
        router.push('/admin/blog')
      } else {
        toast.error(result.error)
      }
    })
  }

  // タイトルからスラッグを自動生成
  const generateSlug = () => {
    const title = getValues('title')
    if (title) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      setValue('slug', slug)
    }
  }

  // エラーがあるタブを検出
  const hasBasicErrors = errors.title || errors.slug || errors.excerpt
  const hasSeoErrors = errors.metaDescription || errors.ogpTitle || errors.ogpDescription
  const hasSettingsErrors = errors.categoryId || errors.thumbnailUrl
  const hasContentErrors = errors.content

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* ヘッダー: タイトル + アクション */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold sm:text-2xl">
              {mode === 'create' ? 'ブログ記事作成' : 'ブログ記事編集'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'create'
                ? '新しいブログ記事を作成します'
                : '記事の内容を編集します'}
              {isDirty && <span className="ml-2 text-amber-500">• 未保存の変更があります</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/admin/blog')}
            >
              キャンセル
            </Button>
            {mode === 'edit' && post && (
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm" disabled={isPending}>
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
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? '保存中...' : mode === 'create' ? '作成' : '保存'}
            </Button>
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger
            value="content"
            className={cn(
              'gap-1.5',
              hasContentErrors && 'text-destructive data-[state=active]:text-destructive'
            )}
          >
            <EditIcon />
            <span className="hidden sm:inline">本文</span>
          </TabsTrigger>
          <TabsTrigger
            value="basic"
            className={cn(
              'gap-1.5',
              hasBasicErrors && 'text-destructive data-[state=active]:text-destructive'
            )}
          >
            <InfoIcon />
            <span className="hidden sm:inline">基本情報</span>
          </TabsTrigger>
          <TabsTrigger
            value="seo"
            className={cn(
              'gap-1.5',
              hasSeoErrors && 'text-destructive data-[state=active]:text-destructive'
            )}
          >
            <SearchIcon />
            <span className="hidden sm:inline">SEO</span>
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className={cn(
              'gap-1.5',
              hasSettingsErrors && 'text-destructive data-[state=active]:text-destructive'
            )}
          >
            <SettingsIcon />
            <span className="hidden sm:inline">設定</span>
          </TabsTrigger>
        </TabsList>

        {/* ========== 本文タブ ========== */}
        <TabsContent value="content" className="mt-4">
          <RichTextEditor
            content={content}
            onChange={(html) => setValue('content', html)}
            placeholder="記事の本文を入力..."
            disabled={isPending}
            minHeight="600px"
          />
          {errors.content && (
            <p className="mt-2 text-sm text-destructive">{errors.content.message}</p>
          )}
        </TabsContent>

        {/* ========== 基本情報タブ ========== */}
        <TabsContent value="basic" className="mt-4">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label htmlFor="title">タイトル</Label>
                <Input
                  id="title"
                  {...register('title')}
                  placeholder="記事のタイトル"
                  disabled={isPending}
                  className="text-lg"
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="slug">スラッグ（URL）</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateSlug}
                    disabled={isPending}
                  >
                    タイトルから生成
                  </Button>
                </div>
                <Input
                  id="slug"
                  {...register('slug')}
                  placeholder="article-slug"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  URLに使用されます: /blog/{getValues('slug') || 'article-slug'}
                </p>
                {errors.slug && (
                  <p className="text-sm text-destructive">{errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt">抜粋</Label>
                <Textarea
                  id="excerpt"
                  {...register('excerpt')}
                  placeholder="記事の抜粋（一覧ページや検索結果に表示されます）"
                  rows={4}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  記事一覧やSNSシェア時に表示される説明文です（500文字以内）
                </p>
                {errors.excerpt && (
                  <p className="text-sm text-destructive">{errors.excerpt.message}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== SEOタブ ========== */}
        <TabsContent value="seo" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="font-semibold">メタ情報</h3>
                <div className="space-y-2">
                  <Label htmlFor="metaDescription">メタディスクリプション</Label>
                  <Textarea
                    id="metaDescription"
                    {...register('metaDescription')}
                    placeholder="検索結果に表示される説明文"
                    rows={3}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    160文字以内推奨。空欄の場合は抜粋が使用されます
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaKeywords">メタキーワード</Label>
                  <Input
                    id="metaKeywords"
                    {...register('metaKeywords')}
                    placeholder="キーワード1, キーワード2, キーワード3"
                    disabled={isPending}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="font-semibold">OGP（SNSシェア設定）</h3>
                <div className="space-y-2">
                  <Label htmlFor="ogpTitle">OGPタイトル</Label>
                  <Input
                    id="ogpTitle"
                    {...register('ogpTitle')}
                    placeholder="SNSシェア時のタイトル"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    60文字以内推奨。空欄の場合は記事タイトルが使用されます
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ogpDescription">OGP説明文</Label>
                  <Textarea
                    id="ogpDescription"
                    {...register('ogpDescription')}
                    placeholder="SNSシェア時の説明文"
                    rows={3}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    160文字以内推奨。空欄の場合は抜粋が使用されます
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========== 設定タブ ========== */}
        <TabsContent value="settings" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 公開設定 */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="font-semibold">公開設定</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="isPublished" className="text-base">公開する</Label>
                    <p className="text-sm text-muted-foreground">
                      オフにすると下書き状態になります
                    </p>
                  </div>
                  <Switch
                    id="isPublished"
                    checked={isPublished}
                    onCheckedChange={(checked) => setValue('isPublished', checked)}
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publishedAt">公開日時</Label>
                  <Input
                    id="publishedAt"
                    type="datetime-local"
                    {...register('publishedAt')}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    空欄の場合、公開時の日時が設定されます
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* カテゴリ・タグ */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="font-semibold">カテゴリ・タグ</h3>
                <div className="space-y-2">
                  <Label htmlFor="categoryId">カテゴリ</Label>
                  <Select
                    value={categoryId}
                    onValueChange={(value) => setValue('categoryId', value)}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="カテゴリを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.categoryId && (
                    <p className="text-sm text-destructive">{errors.categoryId.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">タグ</Label>
                  <Input
                    id="tags"
                    {...register('tags')}
                    placeholder="タグ1, タグ2, タグ3"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    カンマ区切りで入力してください
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* 画像設定 */}
            <Card className="lg:col-span-2">
              <CardContent className="space-y-4 pt-6">
                <h3 className="font-semibold">画像設定</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="thumbnailUrl">サムネイルURL</Label>
                    <Input
                      id="thumbnailUrl"
                      {...register('thumbnailUrl')}
                      placeholder="/images/blog/thumbnail.jpg"
                      disabled={isPending}
                    />
                    {errors.thumbnailUrl && (
                      <p className="text-sm text-destructive">{errors.thumbnailUrl.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ogpImageUrl">OGP画像URL</Label>
                    <Input
                      id="ogpImageUrl"
                      {...register('ogpImageUrl')}
                      placeholder="/images/blog/ogp.jpg"
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      空欄の場合、サムネイルが使用されます
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* レイアウト設定 */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="font-semibold">レイアウト設定</h3>
                <div className="space-y-2">
                  <Label htmlFor="contentWidth">コンテンツ幅</Label>
                  <Select
                    value={contentWidth || ''}
                    onValueChange={(value) => {
                      setValue('contentWidth', value || undefined)
                      if (value !== 'CUSTOM') {
                        setValue('contentWidthCustom', undefined)
                      }
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger id="contentWidth">
                      <SelectValue placeholder="デフォルト" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_WIDTH_OPTIONS.map((option) => (
                        <SelectItem key={option.value || 'default'} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    個別に幅を設定（空欄でサイト設定を使用）
                  </p>
                </div>

                {contentWidth === 'CUSTOM' && (
                  <div className="space-y-2">
                    <Label htmlFor="contentWidthCustom">カスタム幅 (px)</Label>
                    <Input
                      id="contentWidthCustom"
                      type="number"
                      min="320"
                      max="1920"
                      {...register('contentWidthCustom')}
                      placeholder="例: 900"
                      disabled={isPending}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </form>
  )
}
