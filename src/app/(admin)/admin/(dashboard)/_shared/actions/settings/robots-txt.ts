'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import {
  robotsTxtSettingsSchema,
  checkRobotsTxtWarnings,
  type RobotsTxtSettingsInput,
} from './schemas'
import { DEFAULT_ROBOTS_TXT } from './robots-txt-constants'

export interface RobotsTxtData {
  robotsTxtEnabled: boolean
  robotsTxtCustom: string | null
  defaultRobotsTxt: string
  warnings: string[]
}

async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role || !canAccessAdmin(role)) return false
  if (!hasPermission(role, 'settings', 'read')) {
    void logPermissionDenied(session.user.id, 'settings', 'read')
    return false
  }
  return true
}

export async function getRobotsTxtSettings(): Promise<RobotsTxtData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) {
    return null
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      robotsTxtEnabled: true,
      robotsTxtCustom: true,
    },
  })

  const robotsTxtCustom = settings?.robotsTxtCustom ?? null
  const warnings = robotsTxtCustom ? checkRobotsTxtWarnings(robotsTxtCustom) : []

  return {
    robotsTxtEnabled: settings?.robotsTxtEnabled ?? false,
    robotsTxtCustom,
    defaultRobotsTxt: DEFAULT_ROBOTS_TXT,
    warnings,
  }
}

export const updateRobotsTxtSettings = withPermission<[data: RobotsTxtSettingsInput], { warnings: string[] }>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<{ warnings: string[] }>> => {
  const parsed = robotsTxtSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
  }

  const { robotsTxtEnabled, robotsTxtCustom } = parsed.data
  const warnings = robotsTxtCustom ? checkRobotsTxtWarnings(robotsTxtCustom) : []

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', robotsTxtEnabled, robotsTxtCustom },
    update: { robotsTxtEnabled, robotsTxtCustom },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  const message = warnings.length > 0
    ? `robots.txt設定を更新しました（警告: ${warnings.length}件）`
    : 'robots.txt設定を更新しました'

  return createSuccess(message, { warnings })
})

export const resetRobotsTxtToDefault = withPermission<[], void>(
  'settings',
  'update'
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', robotsTxtEnabled: false, robotsTxtCustom: null },
    update: { robotsTxtEnabled: false, robotsTxtCustom: null },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('robots.txt設定をデフォルトに戻しました')
})
