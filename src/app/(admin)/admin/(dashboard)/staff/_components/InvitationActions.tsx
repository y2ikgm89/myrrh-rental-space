'use client'

/**
 * 招待操作コンポーネント
 *
 * 再送・削除の操作を提供
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/admin/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/admin/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/admin/components/ui/alert-dialog'
import { deleteInvitation, resendInvitation } from '@/admin/actions/staff-invitation'
import type { InvitationData } from '@/admin/lib/validations/staff-invitation'

type Props = {
  invitation: InvitationData
}

export function InvitationActions({ invitation }: Props) {
  const router = useRouter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleResend() {
    setIsResending(true)
    try {
      const result = await resendInvitation(invitation.id)
      if (result.success) {
        router.refresh()
      } else {
        alert(result.error ?? '再送に失敗しました')
      }
    } finally {
      setIsResending(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const result = await deleteInvitation(invitation.id)
      if (result.success) {
        setIsDeleteDialogOpen(false)
        router.refresh()
      } else {
        alert(result.error ?? '削除に失敗しました')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <span className="sr-only">メニューを開く</span>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleResend} disabled={isResending}>
            {isResending ? '送信中...' : '招待を再送'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-destructive"
          >
            招待を取り消し
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>招待を取り消しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {invitation.email} への招待を取り消します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? '削除中...' : '取り消し'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
