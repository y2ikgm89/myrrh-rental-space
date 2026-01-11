'use client'

/**
 * ページ編集フォーム
 *
 * Tiptapリッチテキストエディタでコンテンツページを編集
 */

import { useTransition } from 'react'
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
  Textarea,
} from '@/components/admin/ui'
import { RichTextEditor } from '@/components/admin/editor'
import { updatePage } from '@/actions/admin/page'
import { updatePageSchema, type PageData } from '@/lib/validations/page'

/**
 * フォーム用スキーマ
 * サーバー側スキーマと一貫性を保ちつつ、フォーム入力に合わせた型を定義
 * - publishedAtをstring型で扱う（HTMLの日付入力はstring型を返すため）
 * - isPublishedを必須booleanに（フォームでは常に値が存在する）
 */
const formSchema = updatePageSchema.extend({
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

type PageFormProps = {
  page: PageData
}

export function PageForm({ page }: PageFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: page.title,
      description: page.description ?? '',
      content: page.content,
      metaDescription: page.metaDescription ?? '',
      metaKeywords: page.metaKeywords ?? '',
      ogpTitle: page.ogpTitle ?? '',
      ogpDescription: page.ogpDescription ?? '',
      ogpImageUrl: page.ogpImageUrl ?? '',
      isPublished: page.isPublished,
      publishedAt: page.publishedAt
        ? format(new Date(page.publishedAt), "yyyy-MM-dd'T'HH:mm")
        : '',
    },
  })

  const isPublished = useWatch({ control, name: 'isPublished' })
  const content = useWatch({ control, name: 'content' })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updatePage(page.slug, {
        title: data.title,
        description: data.description,
        content: data.content,
        metaDescription: data.metaDescription,
        metaKeywords: data.metaKeywords,
        ogpTitle: data.ogpTitle,
        ogpDescription: data.ogpDescription,
        ogpImageUrl: data.ogpImageUrl,
        isPublished: data.isPublished,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      })

      if (result.success) {
        router.refresh()
        toast.success('ページを更新しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ページ編集</h1>
          <p className="text-muted-foreground">
            /{page.slug} のコンテンツを編集します
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/pages')}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.open(`/${page.slug}`, '_blank')}
          >
            プレビュー
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? '保存中...' : '保存'}
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
                  placeholder="ページタイトル"
                  disabled={isPending}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">説明</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="ページの説明（任意）"
                  rows={2}
                  disabled={isPending}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>コンテンツ</Label>
                <RichTextEditor
                  content={content}
                  onChange={(html) => setValue('content', html)}
                  placeholder="ページの本文を入力..."
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
                {errors.metaDescription && (
                  <p className="text-sm text-destructive">{errors.metaDescription.message}</p>
                )}
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
                  placeholder="SNSシェア時のタイトル（100文字以内推奨）"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogpDescription">OGP説明文</Label>
                <Textarea
                  id="ogpDescription"
                  {...register('ogpDescription')}
                  placeholder="SNSシェア時の説明文（200文字以内推奨）"
                  rows={2}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogpImageUrl">OGP画像URL</Label>
                <Input
                  id="ogpImageUrl"
                  {...register('ogpImageUrl')}
                  placeholder="https://example.com/images/ogp.jpg"
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
              <CardTitle>ページ情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">スラッグ</p>
                <p className="font-mono">/{page.slug}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">作成日時</p>
                <p>
                  {new Date(page.createdAt).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">更新日時</p>
                <p>
                  {new Date(page.updatedAt).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
