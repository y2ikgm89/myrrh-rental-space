'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/admin/components/ui'
import { deleteSpaceCategory } from '@/admin/actions/space-category'
import type { SpaceCategoryWithStats } from '@/admin/lib/validations/space-category'

type DeleteCategoryButtonProps = {
  category: SpaceCategoryWithStats
}

export function DeleteCategoryButton({ category }: DeleteCategoryButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  const hasSpaces = category._count.spaces > 0

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteSpaceCategory(category.id)
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
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          disabled={hasSpaces}
          title={hasSpaces ? `${category._count.spaces}件のスペースが紐づいています` : undefined}
        >
          削除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>カテゴリーを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {hasSpaces ? (
              <>
                このカテゴリーには{category._count.spaces}件のスペースが紐づいています。
                先にスペースのカテゴリーを変更してください。
              </>
            ) : (
              <>
                「{category.name}」を削除します。この操作は取り消せません。
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending || hasSpaces}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? '削除中...' : '削除する'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
