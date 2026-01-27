'use client'

import { useRouter } from 'next/navigation'
import { useWatch } from 'react-hook-form'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Label,
  Switch,
} from '@/admin/components/ui'
import { useFormAction } from '@/admin/hooks'
import {
  faqCategoryFormSchema,
  defaultFaqCategoryFormValues,
  type FaqCategoryWithItems,
} from '@/admin/lib/validations/faq'
import { createFaqCategory, updateFaqCategory } from '@/admin/actions/faq'

type FaqCategoryFormProps = {
  category?: FaqCategoryWithItems
  mode: 'create' | 'edit'
}

export function FaqCategoryForm({ category, mode }: FaqCategoryFormProps) {
  const router = useRouter()

  const { form, isPending, onSubmit } = useFormAction(
    faqCategoryFormSchema,
    async (data) => {
      if (mode === 'create') {
        return createFaqCategory(data)
      }
      return updateFaqCategory(category!.id, data)
    },
    {
      redirectTo: '/admin/faq',
      defaultValues: category
        ? {
            name: category.name,
            slug: category.slug,
            description: category.description,
            order: category.order,
            isActive: category.isActive,
          }
        : defaultFaqCategoryFormValues,
    }
  )

  const {
    register,
    formState: { errors },
    setValue,
    control,
  } = form

  const isActive = useWatch({ control, name: 'isActive' })

  // 名前からスラッグを自動生成
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    if (mode === 'create') {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      setValue('slug', slug)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">カテゴリ名 *</Label>
            <Input
              id="name"
              {...register('name', {
                onChange: handleNameChange,
              })}
              placeholder="例: ご予約について"
              disabled={isPending}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">スラッグ *</Label>
            <Input
              id="slug"
              {...register('slug')}
              placeholder="例: reservation"
              disabled={isPending}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'slug-error' : 'slug-hint'}
            />
            <p id="slug-hint" className="text-xs text-muted-foreground">
              URLに使用される識別子です（半角英数字とハイフンのみ）
            </p>
            {errors.slug && (
              <p id="slug-error" className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="カテゴリの説明（オプション）"
              rows={3}
              disabled={isPending}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && (
              <p id="description-error" className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="order">表示順</Label>
            <Input
              id="order"
              type="number"
              {...register('order', { valueAsNumber: true })}
              placeholder="0"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              小さい数字が先に表示されます
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Switch
              checked={isActive}
              onCheckedChange={(checked) => setValue('isActive', checked)}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">{isActive ? '公開中' : '非公開'}</p>
              <p className="text-sm text-muted-foreground">
                {isActive
                  ? 'このカテゴリは公開ページに表示されます'
                  : 'このカテゴリは公開ページに表示されません'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
          {isPending
            ? mode === 'create'
              ? '作成中...'
              : '更新中...'
            : mode === 'create'
              ? '作成'
              : '更新'}
        </Button>
      </div>
    </form>
  )
}
