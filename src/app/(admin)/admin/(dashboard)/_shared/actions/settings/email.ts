'use server'

/**
 * メール設定・通知設定 Server Actions
 *
 * @module admin/actions/settings/email
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'

import {
  emailSettingsSchema,
  notificationSettingsSchema,
  type EmailSettingsInput,
  type NotificationSettingsInput,
} from './schemas'

// =============================================================================
// Actions
// =============================================================================

/**
 * メール設定を更新
 */
export const updateEmailSettings = withPermission<[data: EmailSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = emailSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const updateData = {
    ...parsed.data,
    senderEmail: parsed.data.senderEmail || null,
    replyToEmail: parsed.data.replyToEmail || null,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('メール設定を更新しました')
})

/**
 * 通知設定を更新
 */
export const updateNotificationSettings = withPermission<[data: NotificationSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = notificationSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('通知設定を更新しました')
})
