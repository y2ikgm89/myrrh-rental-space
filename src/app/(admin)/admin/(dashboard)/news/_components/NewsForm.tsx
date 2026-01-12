'use client'

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
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
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
import { createNews, updateNews, deleteNews } from '@/actions/admin/news'
import type { NewsData } from '@/actions/admin/news'

const formSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
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

type NewsFormProps = {
  news?: NewsData
  mode: 'create' | 'edit'
}

export function NewsForm({ news, mode }: NewsFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: news?.title ?? '',
      content: news?.content ?? '',
      isPublished: news?.isPublished ?? false,
      publishedAt: news?.publishedAt
        ? format(new Date(news.publishedAt), "yyyy-MM-dd'T'HH:mm")
        : '',
      contentWidth: news?.contentWidth ?? '',
      contentWidthCustom: news?.contentWidthCustom?.toString() ?? '',
    },
  })

  const isPublished = useWatch({ control, name: 'isPublished' })
  const content = useWatch({ control, name: 'content' })
  const contentWidth = useWatch({ control, name: 'contentWidth' })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const payload = {
        title: data.title,
        content: data.content,
        isPublished: data.isPublished,
        publishedAt: data.publishedAt || null,
        contentWidth: data.contentWidth || null,
        contentWidthCustom: data.contentWidthCustom
          ? parseInt(data.contentWidthCustom, 10)
          : null,
      }

      if (mode === 'create') {
        const result = await createNews(payload)
        if (result.success) {
          router.push(`/admin/news/${result.data.id}`)
        } else {
          toast.error(result.error)
        }
      } else if (news) {
        const result = await updateNews(news.id, payload)
        if (result.success) {
          router.refresh()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleDelete = () => {
    if (!news) return

    startTransition(async () => {
      const result = await deleteNews(news.id)
      if (result.success) {
        router.push('/admin/news')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {mode === 'create' ? 'お知らせ作成' : 'お知らせ編集'}
          </h1>
          <p className="text-muted-foreground">
            {mode === 'create'
              ? '新しいお知らせを作成します'
              : 'お知らせの内容を編集します'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/news')}
          >
            キャンセル
          </Button>
          {mode === 'edit' && news && (
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={isPending}>
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
          <Button type="submit" disabled={isPending}>
            {isPending ? '保存中...' : mode === 'create' ? '作成' : '保存'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* メイン */}
        <div className="md:col-span-2 space-y-6">
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
                  placeholder="お知らせのタイトル"
                  disabled={isPending}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>本文</Label>
                <RichTextEditor
                  content={content}
                  onChange={(html) => setValue('content', html, { shouldValidate: true })}
                  placeholder="お知らせの本文を入力..."
                  disabled={isPending}
                  minHeight="400px"
                />
                {errors.content && (
                  <p className="text-sm text-destructive">{errors.content.message}</p>
                )}
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
              <CardTitle>レイアウト</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
      </div>
    </form>
  )
}
