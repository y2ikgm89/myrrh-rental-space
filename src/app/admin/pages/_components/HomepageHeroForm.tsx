'use client'

/**
 * ホームページヒーロー編集フォーム
 *
 * トップページのヒーローセクションを編集
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { updateHomepageHero } from '@/actions/admin/homepage-hero'
import { z } from 'zod'
import {
  updateHomepageHeroSchema,
  type HomepageHeroData,
} from '@/lib/validations/page'

/**
 * フォーム用スキーマ
 * isActiveを必須booleanに（フォームでは常に値が存在する）
 */
const formSchema = updateHomepageHeroSchema.extend({
  isActive: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

type HomepageHeroFormProps = {
  hero: HomepageHeroData
}

export function HomepageHeroForm({ hero }: HomepageHeroFormProps) {
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
      title: hero.title,
      subtitle: hero.subtitle ?? '',
      ctaPrimaryText: hero.ctaPrimaryText,
      ctaPrimaryUrl: hero.ctaPrimaryUrl,
      ctaSecondaryText: hero.ctaSecondaryText ?? '',
      ctaSecondaryUrl: hero.ctaSecondaryUrl ?? '',
      backgroundImageUrl: hero.backgroundImageUrl ?? '',
      isActive: hero.isActive,
    },
  })

  const isActive = useWatch({ control, name: 'isActive' })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updateHomepageHero({
        title: data.title,
        subtitle: data.subtitle,
        ctaPrimaryText: data.ctaPrimaryText,
        ctaPrimaryUrl: data.ctaPrimaryUrl,
        ctaSecondaryText: data.ctaSecondaryText,
        ctaSecondaryUrl: data.ctaSecondaryUrl,
        backgroundImageUrl: data.backgroundImageUrl,
        isActive: data.isActive,
      })

      if (result.success) {
        router.refresh()
        alert('ヒーローセクションを更新しました')
      } else {
        alert(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ホームページヒーロー編集</h1>
          <p className="text-muted-foreground">
            トップページのヒーローセクションを編集します
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
            onClick={() => window.open('/', '_blank')}
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
              <CardTitle>メインコンテンツ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">タイトル</Label>
                <Input
                  id="title"
                  {...register('title')}
                  placeholder="理想のスペースを、あなたに。"
                  disabled={isPending}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle">サブタイトル</Label>
                <Textarea
                  id="subtitle"
                  {...register('subtitle')}
                  placeholder="ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース"
                  rows={3}
                  disabled={isPending}
                />
                {errors.subtitle && (
                  <p className="text-sm text-destructive">{errors.subtitle.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CTAボタン</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border p-4 space-y-4">
                <h4 className="font-medium">メインボタン（必須）</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ctaPrimaryText">ボタンテキスト</Label>
                    <Input
                      id="ctaPrimaryText"
                      {...register('ctaPrimaryText')}
                      placeholder="スペースを探す"
                      disabled={isPending}
                    />
                    {errors.ctaPrimaryText && (
                      <p className="text-sm text-destructive">{errors.ctaPrimaryText.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ctaPrimaryUrl">リンク先URL</Label>
                    <Input
                      id="ctaPrimaryUrl"
                      {...register('ctaPrimaryUrl')}
                      placeholder="/spaces"
                      disabled={isPending}
                    />
                    {errors.ctaPrimaryUrl && (
                      <p className="text-sm text-destructive">{errors.ctaPrimaryUrl.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <h4 className="font-medium">サブボタン（任意）</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ctaSecondaryText">ボタンテキスト</Label>
                    <Input
                      id="ctaSecondaryText"
                      {...register('ctaSecondaryText')}
                      placeholder="お問い合わせ"
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ctaSecondaryUrl">リンク先URL</Label>
                    <Input
                      id="ctaSecondaryUrl"
                      {...register('ctaSecondaryUrl')}
                      placeholder="/contact"
                      disabled={isPending}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  両方空欄の場合、サブボタンは表示されません
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* サイドバー */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>表示設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">ヒーローを表示する</Label>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                  disabled={isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                オフにするとヒーローセクションが非表示になります
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>背景画像</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backgroundImageUrl">画像URL</Label>
                <Input
                  id="backgroundImageUrl"
                  {...register('backgroundImageUrl')}
                  placeholder="https://example.com/images/hero-bg.jpg"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  空欄の場合、デフォルトの背景が使用されます
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">更新日時</p>
                <p>
                  {new Date(hero.updatedAt).toLocaleDateString('ja-JP', {
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
