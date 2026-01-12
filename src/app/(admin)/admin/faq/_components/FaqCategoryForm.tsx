'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
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
} from '@/components/admin/ui'
import {
  faqCategoryFormSchema,
  defaultFaqCategoryFormValues,
  type FaqCategoryFormInput,
  type FaqCategoryWithItems,
} from '@/lib/validations/faq'
import { createFaqCategory, updateFaqCategory } from '@/actions/admin/faq'

type FaqCategoryFormProps = {
  category?: FaqCategoryWithItems
  mode: 'create' | 'edit'
}

export function FaqCategoryForm({ category, mode }: FaqCategoryFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FaqCategoryFormInput>({
    resolver: zodResolver(faqCategoryFormSchema),
    defaultValues: category
      ? {
          name: category.name,
          slug: category.slug,
          description: category.description,
          order: category.order,
          isActive: category.isActive,
        }
      : defaultFaqCategoryFormValues,
  })

  const isActive = watch('isActive')

  const onSubmit = async (data: FaqCategoryFormInput) => {
    startTransition(async () => {
      if (mode === 'create') {
        const result = await createFaqCategory(data)
        if (result.success) {
          toast.success(result.message)
          router.push('/admin/faq')
        } else {
          toast.error(result.error)
        }
      } else if (category) {
        const result = await updateFaqCategory(category.id, data)
        if (result.success) {
          toast.success(result.message)
          router.push('/admin/faq')
        } else {
          toast.error(result.error)
        }
      }
    })
  }

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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">スラッグ *</Label>
            <Input
              id="slug"
              {...register('slug')}
              placeholder="例: reservation"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              URLに使用される識別子です（半角英数字とハイフンのみ）
            </p>
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
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
            />
            {errors.description && (
              <p className="text-sm text-destructive">
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
            ? '保存中...'
            : mode === 'create'
              ? '作成する'
              : '更新する'}
        </Button>
      </div>
    </form>
  )
}
