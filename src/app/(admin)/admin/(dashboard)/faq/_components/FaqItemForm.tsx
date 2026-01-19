'use client'

import { useRouter } from 'next/navigation'
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
} from '@/admin/components/ui'
import { RichTextEditor } from '@/admin/components/editor'
import { useFormAction } from '@/admin/hooks'
import {
  faqItemFormSchema,
  defaultFaqItemFormValues,
  type FaqItemWithCategory,
} from '@/admin/lib/validations/faq'
import { createFaqItem, updateFaqItem } from '@/admin/actions/faq'

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

  const { form, isPending, onSubmit } = useFormAction(
    faqItemFormSchema,
    async (data) => {
      if (mode === 'create') {
        return createFaqItem(data)
      }
      return updateFaqItem(item!.id, data)
    },
    {
      redirectTo: '/admin/faq',
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
    }
  )

  const {
    register,
    formState: { errors },
    setValue,
    watch,
  } = form

  const isActive = watch('isActive')
  const categoryId = watch('categoryId')

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
