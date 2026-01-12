'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
} from '@/components/admin/ui'
import { RichTextEditor } from '@/components/admin/editor'
import {
  faqItemFormSchema,
  defaultFaqItemFormValues,
  type FaqItemFormInput,
  type FaqItemWithCategory,
} from '@/lib/validations/faq'
import { createFaqItem, updateFaqItem } from '@/actions/admin/faq'

type Category = {
  id: string
  name: string
}

type FaqItemFormProps = {
  item?: FaqItemWithCategory
  categories: Category[]
  mode: 'create' | 'edit'
  defaultCategoryId?: string
}

export function FaqItemForm({
  item,
  categories,
  mode,
  defaultCategoryId,
}: FaqItemFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<FaqItemFormInput>({
    resolver: zodResolver(faqItemFormSchema),
    defaultValues: item
      ? {
          categoryId: item.categoryId,
          question: item.question,
          answer: item.answer,
          order: item.order,
          isActive: item.isActive,
        }
      : {
          ...defaultFaqItemFormValues,
          categoryId: defaultCategoryId || '',
        },
  })

  const isActive = useWatch({ control, name: 'isActive' })
  const categoryId = useWatch({ control, name: 'categoryId' })

  const onSubmit = async (data: FaqItemFormInput) => {
    startTransition(async () => {
      if (mode === 'create') {
        const result = await createFaqItem(data)
        if (result.success) {
          toast.success(result.message)
          router.push('/admin/faq')
        } else {
          toast.error(result.error)
        }
      } else if (item) {
        const result = await updateFaqItem(item.id, data)
        if (result.success) {
          toast.success(result.message)
          router.push('/admin/faq')
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>質問情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categoryId">カテゴリ *</Label>
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
              <p className="text-sm text-destructive">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="question">質問 *</Label>
            <Input
              id="question"
              {...register('question')}
              placeholder="例: 予約はいつまでキャンセルできますか？"
              disabled={isPending}
            />
            {errors.question && (
              <p className="text-sm text-destructive">
                {errors.question.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>回答 *</Label>
            <RichTextEditor
              content={item?.answer || ''}
              onChange={(html) => setValue('answer', html)}
              placeholder="回答を入力..."
              minHeight="200px"
              disabled={isPending}
              showFloatingToolbar={false}
            />
            {errors.answer && (
              <p className="text-sm text-destructive">
                {errors.answer.message}
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
                  ? 'この質問は公開ページに表示されます'
                  : 'この質問は公開ページに表示されません'}
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
