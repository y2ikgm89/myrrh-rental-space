'use server'

/**
 * Google Calendar連携 Server Actions
 *
 * @module admin/actions/settings/google-calendar
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import {
  testServiceAccountConnection,
  testOAuthConnection,
  encryptServiceAccountJson,
  isValidCalendarId,
  getGoogleCalendarSettings,
  setupWebhookWatch,
  stopWebhookWatch,
} from '@/shared/lib/google-calendar'
import { syncFromCalendar } from '@/shared/lib/calendar-sync'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { serverEnv } from '@/shared/lib/env/server'

import {
  googleCalendarSettingsSchema,
  twoWaySyncSettingsSchema,
  type GoogleCalendarSettingsInput,
  type TwoWaySyncSettingsInput,
} from './schemas'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 書き込み権限チェック（カスタム戻り値型を持つアクション用）
 */
async function checkWritePermission(): Promise<{ user: { id: string } } | { error: string }> {
  const session = await getSession()
  if (!session?.user) {
    return { error: 'ログインが必要です' }
  }
  const role = getRoleFromSession(session)
  if (!role) {
    return { error: '権限情報が取得できません' }
  }
  if (!canAccessAdmin(role)) {
    return { error: '管理者権限が必要です' }
  }
  if (!hasPermission(role, 'settings', 'update')) {
    void logPermissionDenied(session.user.id, 'settings', 'update')
    return { error: 'settingsのupdate権限がありません' }
  }
  return { user: { id: session.user.id } }
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Google Calendar設定を更新
 */
export const updateGoogleCalendarSettings = withPermission<[data: GoogleCalendarSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = googleCalendarSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  // カレンダーIDのバリデーション
  if (parsed.data.googleCalendarId && !isValidCalendarId(parsed.data.googleCalendarId)) {
    return createFailure('カレンダーIDの形式が無効です')
  }

  const updateData: Record<string, unknown> = {
    googleCalendarEnabled: parsed.data.googleCalendarEnabled,
    googleCalendarId: parsed.data.googleCalendarId || null,
    icalAttachmentEnabled: parsed.data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: parsed.data.addToCalendarLinksEnabled,
  }

  // サービスアカウントJSONが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.serviceAccountJson) {
    try {
      // JSONとして有効か確認
      JSON.parse(parsed.data.serviceAccountJson)
      updateData['googleCalendarServiceAccountJson'] = encryptServiceAccountJson(
        parsed.data.serviceAccountJson
      )
    } catch {
      return createFailure('サービスアカウントJSONの形式が無効です')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('Google Calendar設定を更新しました')
})

/**
 * サービスアカウント接続テスト
 */
export async function testGoogleCalendarConnectionAction(params: {
  serviceAccountJson: string
  calendarId: string
}): Promise<{
  success: boolean
  error?: string
  calendarName?: string
  accountEmail?: string
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    if (!isValidCalendarId(params.calendarId)) {
      return { success: false, error: 'カレンダーIDの形式が無効です' }
    }

    const result = await testServiceAccountConnection({
      serviceAccountJson: params.serviceAccountJson,
      calendarId: params.calendarId,
    })

    if (result.success) {
      // 接続成功時、ステータスを更新
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          googleCalendarLastTestedAt: new Date(),
          googleCalendarConnectionStatus: 'connected',
        },
        update: {
          googleCalendarLastTestedAt: new Date(),
          googleCalendarConnectionStatus: 'connected',
        },
      })

      updateTag(CACHE_TAGS.SETTINGS)
    } else {
      // 接続失敗時もステータスを更新
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarConnectionStatus: 'error',
        },
      })
    }

    return result
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'testGoogleCalendarConnectionAction', calendarId: params.calendarId },
    })
    return { success: false, error: '接続テストに失敗しました' }
  }
}

/**
 * OAuth接続テスト（管理者の個人カレンダー）
 */
export async function testGoogleCalendarOAuthAction(): Promise<{
  success: boolean
  error?: string
  calendarName?: string
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    const result = await testOAuthConnection(check.user.id)

    if (result.success) {
      // 接続成功時、OAuth有効フラグを更新
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          googleCalendarOAuthEnabled: true,
        },
        update: {
          googleCalendarOAuthEnabled: true,
        },
      })

      updateTag(CACHE_TAGS.SETTINGS)
    }

    return result
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'testGoogleCalendarOAuthAction' },
    })
    return { success: false, error: 'OAuth接続テストに失敗しました' }
  }
}

/**
 * Google Calendarサービスアカウント認証情報をクリア
 */
export const clearGoogleCalendarServiceAccount = withPermission<[], void>(
  'settings',
  'update'
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('サービスアカウント認証情報をクリアしました')
})

/**
 * Google Calendar OAuth連携を解除
 */
export const disconnectGoogleCalendarOAuth = withPermission<[], void>(
  'settings',
  'update'
)(async (user): Promise<ActionResult<void>> => {
  // Accountテーブルからトークンを削除
  await prisma.account.deleteMany({
    where: {
      userId: user.id,
      providerId: 'google',
    },
  })

  // OAuth有効フラグをオフ
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleCalendarOAuthEnabled: false,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('Google Calendar OAuth連携を解除しました')
})

/**
 * Google Calendar設定を取得（公開用）
 */
export { getGoogleCalendarSettings }

// =============================================================================
// Two-Way Sync Actions
// =============================================================================

/**
 * 双方向同期設定を更新
 */
export const updateTwoWaySyncSettings = withPermission<[data: TwoWaySyncSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = twoWaySyncSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      googleCalendarTwoWaySyncEnabled: parsed.data.enabled,
      googleCalendarSyncMethod: parsed.data.syncMethod,
      googleCalendarPollingIntervalMin: parsed.data.pollingIntervalMin,
    },
    update: {
      googleCalendarTwoWaySyncEnabled: parsed.data.enabled,
      googleCalendarSyncMethod: parsed.data.syncMethod,
      googleCalendarPollingIntervalMin: parsed.data.pollingIntervalMin,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('双方向同期設定を更新しました')
})

/**
 * Webhookを設定
 */
export async function setupCalendarWebhook(): Promise<{
  success: boolean
  error?: string
  expiration?: Date
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    // ベースURLを取得（環境変数から）
    const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || serverEnv.VERCEL_URL
    if (!baseUrl) {
      return { success: false, error: 'APP_URLが設定されていません' }
    }

    const webhookUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`

    const result = await setupWebhookWatch(webhookUrl)

    if (result.success && result.channelId && result.resourceId) {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarWebhookChannelId: result.channelId,
          googleCalendarWebhookResourceId: result.resourceId,
          googleCalendarWebhookExpiration: result.expiration,
        },
      })

      updateTag(CACHE_TAGS.SETTINGS)

      return { success: true, expiration: result.expiration }
    }

    return { success: false, error: result.error }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'setupCalendarWebhook' },
    })
    return { success: false, error: 'Webhook設定に失敗しました' }
  }
}

/**
 * Webhookを停止
 */
export async function stopCalendarWebhook(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        googleCalendarWebhookChannelId: true,
        googleCalendarWebhookResourceId: true,
      },
    })

    if (!settings?.googleCalendarWebhookChannelId || !settings?.googleCalendarWebhookResourceId) {
      return { success: false, error: 'Webhookが設定されていません' }
    }

    const result = await stopWebhookWatch(
      settings.googleCalendarWebhookChannelId,
      settings.googleCalendarWebhookResourceId
    )

    if (result.success) {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarWebhookChannelId: null,
          googleCalendarWebhookResourceId: null,
          googleCalendarWebhookExpiration: null,
        },
      })

      updateTag(CACHE_TAGS.SETTINGS)
    }

    return result
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'stopCalendarWebhook' },
    })
    return { success: false, error: 'Webhook停止に失敗しました' }
  }
}

/**
 * 手動で同期を実行
 */
export async function triggerManualSync(): Promise<{
  success: boolean
  processed?: number
  deleted?: number
  updated?: number
  errors?: string[]
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, errors: [check.error] }
    }

    const result = await syncFromCalendar()

    updateTag(CACHE_TAGS.SETTINGS)
    updateTag(CACHE_TAGS.RESERVATIONS)

    return {
      success: result.success,
      processed: result.processed,
      deleted: result.deleted,
      updated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'triggerManualSync' },
    })
    return { success: false, errors: ['同期に失敗しました'] }
  }
}
