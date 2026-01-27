'use server'

/**
 * 事業者情報・連絡先・営業時間 Server Actions
 *
 * @module admin/actions/settings/business
 */

import { prisma, Prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'

import {
  businessInfoSchema,
  contactInfoSchema,
  businessHoursSettingsSchema,
  type BusinessInfoInput,
  type ContactInfoInput,
  type BusinessHoursSettingsInput,
} from './schemas'

// =============================================================================
// Actions
// =============================================================================

/**
 * 事業者情報を更新
 */
export const updateBusinessInfo = withPermission<[data: BusinessInfoInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = businessInfoSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const updateData = {
    ...parsed.data,
    establishedDate: parsed.data.establishedDate
      ? new Date(parsed.data.establishedDate)
      : null,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('事業者情報を更新しました')
})

/**
 * 連絡先情報を更新
 */
export const updateContactInfo = withPermission<[data: ContactInfoInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = contactInfoSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const updateData = {
    ...parsed.data,
    email: parsed.data.email || null,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('連絡先情報を更新しました')
})

/**
 * 営業時間設定を更新
 */
export const updateBusinessHoursSettings = withPermission<[data: BusinessHoursSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = businessHoursSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // Prisma JSON null の適切な変換
  const updateData = {
    businessHours: parsed.data.businessHours,
    regularHolidays: parsed.data.regularHolidays ?? Prisma.JsonNull,
    specialHolidays: parsed.data.specialHolidays ?? Prisma.JsonNull,
    holidayNotice: parsed.data.holidayNotice,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.RESERVATIONS)

  return createSuccess('営業時間設定を更新しました')
})
