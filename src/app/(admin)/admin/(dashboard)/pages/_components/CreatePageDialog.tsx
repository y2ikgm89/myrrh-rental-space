'use client'

/**
 * 新規ページ作成ダイアログ
 *
 * シンプルなページ作成モーダル
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/admin/components/ui/dialog'
import { Input } from '@/admin/components/ui/input'
import { Label } from '@/admin/components/ui/label'
import { Textarea } from '@/admin/components/ui/textarea'
import { createPage } from '@/admin/actions/page'

const formSchema = z.object({
  slug: z
    .string()
    .min(1, 'スラッグは必須です')
    .max(100, 'スラッグは100文字以内です')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '半角英数字とハイフンのみ使用可能'),
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
})

type FormData = z.infer<typeof formSchema>

export function CreatePageDialog() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: '',
      title: '',
      description: '',
    },
  })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const result = await createPage({
          slug: data.slug,
          title: data.title,
          description: data.description,
          isPublished: false,
        })

        if (result.success && result.slug) {
          toast.success('ページを作成しました')
          setIsOpen(false)
          reset()
          router.push(`/admin/pages/${result.slug}/edit`)
        } else if (!result.success) {
          toast.error(result.error || 'ページの作成に失敗しました')
        }
      } catch (error) {
        console.error('ページ作成エラー:', error)
        toast.error('ページの作成中にエラーが発生しました')
      }
    })
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      reset()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          新規ページ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新規ページ作成</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">
              スラッグ <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <Input
                id="slug"
                placeholder="about-us"
                {...register('slug')}
                disabled={isPending}
              />
            </div>
            {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
            <p className="text-xs text-muted-foreground">
              URLに使用されます（例: example.com/about-us）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="ページタイトル"
              {...register('title')}
              disabled={isPending}
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明（オプション）</Label>
            <Textarea
              id="description"
              placeholder="ページの説明"
              {...register('description')}
              disabled={isPending}
              rows={2}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  作成中...
                </>
              ) : (
                '作成してエディターを開く'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
