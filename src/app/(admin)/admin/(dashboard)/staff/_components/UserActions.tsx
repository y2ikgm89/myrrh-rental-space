'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/admin/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/admin/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/admin/components/ui'
import { DeleteConfirmDialog } from '@/admin/components/DeleteConfirmDialog'
import { deleteUser, updateUserRole, type UserData } from '@/admin/actions/user'
import { Role, isAdminRole } from '@/admin/lib/role-guards'
import Link from 'next/link'

type Props = {
  user: UserData
}

export function UserActions({ user }: Props) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const result = await deleteUser(user.id)
      if (result.success) {
        setDeleteDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleRoleChange(newRole: Role) {
    setIsUpdatingRole(true)
    try {
      const result = await updateUserRole(user.id, newRole)
      if (result.success) {
        setRoleDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } finally {
      setIsUpdatingRole(false)
    }
  }

  const newRole = isAdminRole(user.role) ? Role.USER : Role.ADMIN
  const newRoleLabel = isAdminRole(user.role) ? 'ユーザー' : '管理者'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/staff/${user.id}`}>詳細</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/staff/${user.id}/edit`}>編集</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRoleDialogOpen(true)}>
            {newRoleLabel}に変更
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive"
          >
            削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={user.name || user.email}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ロールを変更</DialogTitle>
            <DialogDescription>
              {user.name || user.email} を{newRoleLabel}に変更しますか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleDialogOpen(false)}
              disabled={isUpdatingRole}
            >
              キャンセル
            </Button>
            <Button
              onClick={() => handleRoleChange(newRole)}
              disabled={isUpdatingRole}
            >
              {isUpdatingRole ? '変更中...' : '変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
