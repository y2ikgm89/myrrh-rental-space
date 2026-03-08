'use server'

import { updateTag } from 'next/cache'
import { z } from 'zod'
import { executeAdminMutation } from '@/admin/lib/admin-action'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import {
  createFailure,
  createSuccess,
  type ActionResult,
} from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import {
  createInvitationSchema,
  setupPasswordSchema,
  type CreateInvitationInput,
  type SetupPasswordInput,
} from '@/admin/lib/validations/staff-invitation'
import {
  deleteInvitation as deleteInvitationCommand,
  resendInvitation as resendInvitationCommand,
  sendInvitation as sendInvitationCommand,
  setupPassword as setupPasswordCommand,
} from '@/shared/domain/staff-invitations/commands'
import {
  getPendingInvitations as getPendingInvitationsQuery,
  validateInvitationToken as validateInvitationTokenQuery,
} from '@/shared/domain/staff-invitations/queries'
import { isDomainError } from '@/shared/domain/domain-error'
import type { InvitationData } from '@/shared/domain/staff-invitations/types'
import { CACHE_TAGS } from '@/shared/lib/constants'

const checkReadPermission = checkReadPermissionFor('user')
const invitationIdSchema = z.string().uuid({ error: '招待IDが不正です' })
const invitationTokenSchema = z.string().min(1, { error: '招待トークンが必要です' })

export async function sendInvitation(
  input: CreateInvitationInput,
): Promise<ActionResult<InvitationData>> {
  const parsed = createInvitationSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'user',
    action: 'create',
    execute: async (user) => sendInvitationCommand(parsed.data, user.id),
    success: (invitation) =>
      createSuccess('招待メールを送信しました', invitation),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF)
    },
    resolveAuditResourceId: (invitation) => invitation.id,
  })
}

export async function validateInvitationToken(
  token: string,
): Promise<ActionResult<InvitationData>> {
  const validated = invitationTokenSchema.safeParse(token)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  const invitation = await validateInvitationTokenQuery(validated.data)
  if (!invitation) {
    return createFailure('無効な招待リンクです')
  }

  if (invitation.usedAt) {
    return createFailure('この招待は既に使用されています')
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return createFailure('この招待は有効期限が切れています')
  }

  return createSuccess('有効な招待です', invitation)
}

export async function setupPassword(
  input: SetupPasswordInput,
): Promise<ActionResult<{ userId: string }>> {
  const parsed = setupPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  try {
    const result = await setupPasswordCommand(parsed.data)
    updateTag(CACHE_TAGS.STAFF)

    return createSuccess('アカウントを作成しました', result)
  } catch (error) {
    if (isDomainError(error)) {
      return createFailure(error.message)
    }

    throw error
  }
}

export async function getPendingInvitations(): Promise<InvitationData[]> {
  if (!(await checkReadPermission())) {
    return []
  }

  return getPendingInvitationsQuery()
}

export async function deleteInvitation(id: string): Promise<ActionResult<void>> {
  const validated = invitationIdSchema.safeParse(id)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'user',
    action: 'delete',
    resourceId: validated.data,
    execute: async () => {
      await deleteInvitationCommand(validated.data)
    },
    success: () => createSuccess('招待を削除しました'),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF)
    },
  })
}

export async function resendInvitation(id: string): Promise<ActionResult<void>> {
  const validated = invitationIdSchema.safeParse(id)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'user',
    action: 'create',
    resourceId: validated.data,
    execute: async () => {
      await resendInvitationCommand(validated.data)
    },
    success: () => createSuccess('招待を再送しました'),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF)
    },
  })
}
