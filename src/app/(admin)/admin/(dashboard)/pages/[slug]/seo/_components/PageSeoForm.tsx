'use client'

/**
 * ページSEO編集フォーム
 *
 * システムページのSEO/OGP設定を編集するフォーム
 */

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ImagePlus } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Textarea,
  Label,
} from '@/admin/components/ui'
import { useSingleMediaPicker } from '@/admin/hooks/use-media-picker'
import {
  updatePageSeoSchema,
  type UpdatePageSeoInput,
  type PageData,
} from '@/admin/lib/validations/page'
import { updatePageSeo } from '@/admin/actions/page'

interface PageSeoFormProps {
  page: PageData
}

export function PageSeoForm({ page }: PageSeoFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<UpdatePageSeoInput>({
    resolver: zodResolver(updatePageSeoSchema),
    defaultValues: {
      title: page.title,
      metaDescription: page.metaDescription || '',
      metaKeywords: page.metaKeywords || '',
      ogpTitle: page.ogpTitle || '',
      ogpDescription: page.ogpDescription || '',
      ogpImageUrl: page.ogpImageUrl || '',
    },
  })

  const ogpImageUrl = useWatch({ control, name: 'ogpImageUrl' })

  const ogpPicker = useSingleMediaPicker({
    defaultUsage: 'GENERAL',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('ogpImageUrl', media[0].url)
      }
    },
  })

  const onSubmit = async (data: UpdatePageSeoInput) => {
    startTransition(async () => {
      const result = await updatePageSeo(page.slug, data)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle>基本SEO設定</CardTitle>
          <CardDescription>
            検索エンジンに表示されるタイトルと説明文
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">ページタイトル *</Label>
            <Input
              id="title"
              {...register('title')}
              placeholder="ページタイトル"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              検索結果やブラウザタブに表示されるタイトル（推奨: 30-60文字）
            </p>
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="metaDescription">メタディスクリプション</Label>
            <Textarea
              id="metaDescription"
              {...register('metaDescription')}
              placeholder="ページの説明文を入力..."
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              検索結果に表示される説明文（推奨: 120-160文字）
            </p>
            {errors.metaDescription && (
              <p className="text-sm text-destructive">
                {errors.metaDescription.message}
              </p>
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
            <p className="text-xs text-muted-foreground">
              カンマ区切りでキーワードを入力（SEO効果は限定的）
            </p>
            {errors.metaKeywords && (
              <p className="text-sm text-destructive">
                {errors.metaKeywords.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* OGP設定 */}
      <Card>
        <CardHeader>
          <CardTitle>OGP設定</CardTitle>
          <CardDescription>
            SNSでシェアされた際に表示される情報
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ogpTitle">OGPタイトル</Label>
            <Input
              id="ogpTitle"
              {...register('ogpTitle')}
              placeholder="SNSシェア用タイトル（空欄時はページタイトルを使用）"
              disabled={isPending}
            />
            {errors.ogpTitle && (
              <p className="text-sm text-destructive">
                {errors.ogpTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ogpDescription">OGP説明文</Label>
            <Textarea
              id="ogpDescription"
              {...register('ogpDescription')}
              placeholder="SNSシェア用説明文（空欄時はメタディスクリプションを使用）"
              rows={2}
              disabled={isPending}
            />
            {errors.ogpDescription && (
              <p className="text-sm text-destructive">
                {errors.ogpDescription.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ogpImageUrl">OGP画像</Label>
            <div className="flex items-start gap-3">
              {ogpImageUrl ? (
                <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border">
                  <Image
                    src={ogpImageUrl}
                    alt="OGP画像"
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => ogpPicker.openPicker()}
                  disabled={isPending}
                >
                  <ImagePlus className="mr-1 h-3 w-3" />
                  画像を選択
                </Button>
                {ogpImageUrl && (
                  <>
                    <p className="truncate text-xs text-muted-foreground">
                      {ogpImageUrl}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setValue('ogpImageUrl', '')}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              推奨サイズ: 1200x630px
            </p>
            {errors.ogpImageUrl && (
              <p className="text-sm text-destructive">
                {errors.ogpImageUrl.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? '保存中...' : '保存'}
        </Button>
      </div>

      {/* メディアピッカーダイアログ */}
      <ogpPicker.MediaPicker />
    </form>
  )
}
