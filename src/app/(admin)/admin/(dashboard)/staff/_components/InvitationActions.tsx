'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionDropdown, ActionDropdownItem, ActionDropdownSeparator } from '@/admin/components/ActionDropdown'
import { DeleteConfirmDialog } from '@/admin/components/DeleteConfirmDialog'
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
      <ActionDropdown disabled={isResending || isDeleting}>
        <ActionDropdownItem onClick={handleResend} disabled={isResending}>
          {isResending ? '送信中...' : '招待を再送'}
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setIsDeleteDialogOpen(true)}>
          招待を取り消し
        </ActionDropdownItem>
      </ActionDropdown>

      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        itemName={`${invitation.email} への招待`}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </>
  )
}
