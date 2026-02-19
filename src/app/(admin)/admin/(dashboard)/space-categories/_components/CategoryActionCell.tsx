'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from '@/admin/components/ActionDropdown'
import { DeleteConfirmDialog } from '@/admin/components/DeleteConfirmDialog'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/admin/components/ui'
import { updateSpaceCategory, deleteSpaceCategory } from '@/admin/actions/space-category'
import type {
  SpaceCategoryFormInput,
  SpaceCategoryWithStats,
} from '@/admin/lib/validations/space-category'
import { CategoryForm } from './CategoryForm'

type CategoryActionCellProps = {
  category: SpaceCategoryWithStats
}

export function CategoryActionCell({ category }: CategoryActionCellProps) {
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isEditPending, startEditTransition] = useTransition()
  const [isDeletePending, startDeleteTransition] = useTransition()

  const hasSpaces = category._count.spaces > 0

  const handleEditSubmit = (data: SpaceCategoryFormInput) => {
    startEditTransition(async () => {
      const result = await updateSpaceCategory(category.id, data)
      if (result.success) {
        toast.success(result.message)
        setIsEditOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteSpaceCategory(category.id)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem onClick={() => setIsEditOpen(true)}>編集</ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          disabled={hasSpaces}
          onClick={() => setIsDeleteOpen(true)}
        >
          {hasSpaces ? `削除 (${category._count.spaces}件のスペースあり)` : '削除'}
        </ActionDropdownItem>
      </ActionDropdown>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>カテゴリー編集</DialogTitle>
          </DialogHeader>
          <CategoryForm
            category={category}
            isPending={isEditPending}
            onSubmit={handleEditSubmit}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={isEditPending}
            >
              キャンセル
            </Button>
            <Button type="submit" form="category-form" disabled={isEditPending}>
              {isEditPending ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={category.name}
        onConfirm={handleDelete}
        isPending={isDeletePending}
      />
    </>
  )
}
