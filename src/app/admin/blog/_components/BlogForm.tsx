'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
} from '@/components/admin/ui'
import { RichTextEditor } from '@/components/admin/editor'
import { createBlogPost, updateBlogPost, deleteBlogPost } from '@/actions/admin/blog'
import type { BlogPostData, BlogCategoryData } from '@/actions/admin/blog'

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

type FormData = z.infer<typeof formSchema>

type BlogFormProps = {
  post?: BlogPostData
  categories: BlogCategoryData[]
  mode: 'create' | 'edit'
}

export function BlogForm({ post, categories, mode }: BlogFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
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
    },
  })

  const isPublished = useWatch({ control, name: 'isPublished' })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const content = useWatch({ control, name: 'content' })

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
      }

      if (mode === 'create') {
        const result = await createBlogPost(payload)
        if (result.success) {
          router.push(`/admin/blog/${result.data.id}`)
        } else {
          alert(result.error)
        }
      } else if (post) {
        const result = await updateBlogPost(post.id, payload)
        if (result.success) {
          router.refresh()
        } else {
          alert(result.error)
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
        alert(result.error)
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {mode === 'create' ? 'ブログ記事作成' : 'ブログ記事編集'}
          </h1>
          <p className="text-muted-foreground">
            {mode === 'create'
              ? '新しいブログ記事を作成します'
              : 'ブログ記事の内容を編集します'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/blog')}
          >
            キャンセル
          </Button>
          {mode === 'edit' && post && (
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={isPending}>
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
          <Button type="submit" disabled={isPending}>
            {isPending ? '保存中...' : mode === 'create' ? '作成' : '保存'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* メイン */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">タイトル</Label>
                <Input
                  id="title"
                  {...register('title')}
                  placeholder="記事のタイトル"
                  disabled={isPending}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="slug">スラッグ</Label>
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
                {errors.slug && (
                  <p className="text-sm text-destructive">{errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt">抜粋</Label>
                <Textarea
                  id="excerpt"
                  {...register('excerpt')}
                  placeholder="記事の抜粋（一覧表示用）"
                  rows={3}
                  disabled={isPending}
                />
                {errors.excerpt && (
                  <p className="text-sm text-destructive">{errors.excerpt.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>本文</Label>
                <RichTextEditor
                  content={content}
                  onChange={(html) => setValue('content', html)}
                  placeholder="記事の本文を入力..."
                  disabled={isPending}
                />
                {errors.content && (
                  <p className="text-sm text-destructive">{errors.content.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="metaDescription">メタディスクリプション</Label>
                <Textarea
                  id="metaDescription"
                  {...register('metaDescription')}
                  placeholder="検索結果に表示される説明文（160文字以内推奨）"
                  rows={2}
                  disabled={isPending}
                />
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

              <div className="space-y-2">
                <Label htmlFor="ogpTitle">OGPタイトル</Label>
                <Input
                  id="ogpTitle"
                  {...register('ogpTitle')}
                  placeholder="SNSシェア時のタイトル（60文字以内推奨）"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogpDescription">OGP説明文</Label>
                <Textarea
                  id="ogpDescription"
                  {...register('ogpDescription')}
                  placeholder="SNSシェア時の説明文（160文字以内推奨）"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* サイドバー */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isPublished">公開する</Label>
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

          <Card>
            <CardHeader>
              <CardTitle>カテゴリ・タグ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

          <Card>
            <CardHeader>
              <CardTitle>画像</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
