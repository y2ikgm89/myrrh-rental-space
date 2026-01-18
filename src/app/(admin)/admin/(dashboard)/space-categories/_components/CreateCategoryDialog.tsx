'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/admin/components/ui'
import { createSpaceCategory } from '@/admin/actions/space-category'
import type { SpaceCategoryFormInput } from '@/admin/lib/validations/space-category'
import { CategoryForm } from './CategoryForm'

export function CreateCategoryDialog() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  const handleSubmit = (data: SpaceCategoryFormInput) => {
    startTransition(async () => {
      const result = await createSpaceCategory(data)
      if (result.success) {
        toast.success(result.message)
        setIsOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>新規作成</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>カテゴリー作成</DialogTitle>
        </DialogHeader>
        <CategoryForm isPending={isPending} onSubmit={handleSubmit} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="submit" form="category-form" disabled={isPending}>
            {isPending ? '作成中...' : '作成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
