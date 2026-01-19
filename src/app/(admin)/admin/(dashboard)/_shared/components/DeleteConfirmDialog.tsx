'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { buttonVariants } from './ui/button'

type DeleteConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  itemName?: string
  onConfirm: () => void
  isPending?: boolean
}

/**
 * 統一された削除確認ダイアログ
 *
 * @example
 * ```tsx
 * <DeleteConfirmDialog
 *   open={deleteDialogOpen}
 *   onOpenChange={setDeleteDialogOpen}
 *   itemName="スペースA"
 *   onConfirm={handleDelete}
 *   isPending={isDeleting}
 * />
 * ```
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  isPending = false,
}: DeleteConfirmDialogProps) {
  const displayTitle = title ?? '削除しますか？'
  const displayDescription =
    description ??
    (itemName
      ? `「${itemName}」を削除します。この操作は取り消せません。`
      : 'この操作は取り消せません。')

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{displayTitle}</AlertDialogTitle>
          <AlertDialogDescription>{displayDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className={buttonVariants({ variant: 'destructive' })}
          >
            {isPending ? '削除中...' : '削除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
