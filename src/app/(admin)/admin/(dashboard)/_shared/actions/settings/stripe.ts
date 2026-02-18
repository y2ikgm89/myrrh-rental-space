'use server'

/**
 * Stripe決済設定 Server Actions
 *
 * @module admin/actions/settings/stripe
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { encrypt } from '@/shared/lib/crypto'
import { testStripeConnection as testStripeConnectionLib } from '@/admin/lib/stripe'
import { stripeSettingsSchema, type StripeSettingsInput } from '@/admin/lib/validations/stripe'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'

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
 * Stripe設定を更新
 */
export const updateStripeSettings = withPermission<[data: StripeSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = stripeSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  // シークレットキーを暗号化
  const updateData: Record<string, unknown> = {
    stripeEnabled: parsed.data.stripeEnabled,
    stripeTestMode: parsed.data.stripeTestMode,
    stripePublishableKey: parsed.data.stripePublishableKey || null,
    stripeCurrency: parsed.data.stripeCurrency,
  }

  // シークレットキーが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.stripeSecretKey) {
    try {
      updateData['stripeSecretKey'] = encrypt(parsed.data.stripeSecretKey)
    } catch {
      return createFailure(
        'シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。'
      )
    }
  }

  // Webhookシークレットが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.stripeWebhookSecret) {
    try {
      updateData['stripeWebhookSecret'] = encrypt(parsed.data.stripeWebhookSecret)
    } catch {
      return createFailure(
        'Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。'
      )
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('Stripe設定を更新しました')
})

/**
 * Stripe接続テスト
 */
export async function testStripeConnectionAction(
  secretKey: string
): Promise<{
  success: boolean
  error?: string
  accountId?: string
  mode?: 'test' | 'live'
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    const result = await testStripeConnectionLib(secretKey)

    if (result.success) {
      // 接続成功時、ステータスを更新
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          stripeLastTestedAt: new Date(),
          stripeConnectionStatus: 'connected',
          stripeAccountId: result.accountId,
        },
        update: {
          stripeLastTestedAt: new Date(),
          stripeConnectionStatus: 'connected',
          stripeAccountId: result.accountId,
        },
      })

      updateTag(CACHE_TAGS.SETTINGS)
    }

    return result
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'testStripeConnectionAction' },
    })
    return { success: false, error: '接続テストに失敗しました' }
  }
}

/**
 * Stripeキーをクリア
 */
export const clearStripeKeys = withPermission<[], void>(
  'settings',
  'update'
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('Stripeキーをクリアしました')
})
