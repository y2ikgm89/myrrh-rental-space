'use server'

/**
 * External Service API Keys Server Actions
 *
 * 外部サービスAPIキーの管理用Server Actions
 */

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { createSuccess, createFailure, withAuth } from '@/types'
import { encrypt, safeDecrypt } from '@/lib/crypto'
import { requireAdmin } from '@/lib/auth'
import {
  resendSettingsSchema,
  turnstileSettingsSchema,
  googleMapsSettingsSchema,
  customApiKeySchema,
  type ResendSettingsInput,
  type TurnstileSettingsInput,
  type GoogleMapsSettingsInput,
  type CustomApiKeyInput,
} from '@/lib/validations/api-keys'
import {
  maskResendKey,
  maskTurnstileKey,
  maskGoogleMapsKey,
  testResendConnection,
  testTurnstileConnection,
  testGoogleMapsConnection,
} from '@/lib/api-keys'
import type {
  ResendConfig,
  TurnstileConfig,
  GoogleMapsConfig,
  CustomApiKeyData,
  CustomApiKeysMap,
} from '@/types/api-keys'

// =============================================================================
// GET Actions
// =============================================================================

/**
 * Resend設定を取得
 */
export async function getResendConfig(): Promise<ResendConfig> {
  await requireAdmin()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      resendApiKey: true,
      resendLastTestedAt: true,
      resendConnectionStatus: true,
    },
  })

  return {
    apiKeyMasked: settings?.resendApiKey
      ? maskResendKey(safeDecrypt(settings.resendApiKey) || '****')
      : null,
    lastTestedAt: settings?.resendLastTestedAt || null,
    connectionStatus:
      (settings?.resendConnectionStatus as 'connected' | 'error') || null,
  }
}

/**
 * Turnstile設定を取得
 */
export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  await requireAdmin()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      turnstileSiteKey: true,
      turnstileSecretKey: true,
      turnstileLastTestedAt: true,
      turnstileConnectionStatus: true,
    },
  })

  return {
    siteKey: settings?.turnstileSiteKey || null,
    secretKeyMasked: settings?.turnstileSecretKey
      ? maskTurnstileKey(safeDecrypt(settings.turnstileSecretKey) || '****')
      : null,
    lastTestedAt: settings?.turnstileLastTestedAt || null,
    connectionStatus:
      (settings?.turnstileConnectionStatus as 'connected' | 'error') || null,
  }
}

/**
 * Google Maps設定を取得
 */
export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  await requireAdmin()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleMapsApiKey: true,
      googleMapsLastTestedAt: true,
      googleMapsConnectionStatus: true,
    },
  })

  return {
    apiKeyMasked: settings?.googleMapsApiKey
      ? maskGoogleMapsKey(safeDecrypt(settings.googleMapsApiKey) || '****')
      : null,
    lastTestedAt: settings?.googleMapsLastTestedAt || null,
    connectionStatus:
      (settings?.googleMapsConnectionStatus as 'connected' | 'error') || null,
  }
}

/**
 * カスタムAPIキー一覧を取得
 */
export async function getCustomApiKeys(): Promise<CustomApiKeyData[]> {
  await requireAdmin()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { customApiKeys: true },
  })

  if (
    !settings?.customApiKeys ||
    typeof settings.customApiKeys !== 'object'
  ) {
    return []
  }

  const keysMap = settings.customApiKeys as CustomApiKeysMap
  return Object.entries(keysMap).map(([id, data]) => ({
    id,
    name: data.name,
    keyName: data.keyName,
    description: data.description,
    lastTestedAt: data.lastTestedAt ? new Date(data.lastTestedAt) : undefined,
    connectionStatus: data.connectionStatus,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }))
}

// =============================================================================
// UPDATE Actions - Resend
// =============================================================================

/**
 * Resend設定を更新
 */
export const updateResendSettings = withAuth(
  async (_user, data: ResendSettingsInput) => {
    const parsed = resendSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const updateData: Record<string, unknown> = {}

    if (parsed.data.resendApiKey) {
      try {
        updateData.resendApiKey = encrypt(parsed.data.resendApiKey)
      } catch {
        return createFailure('APIキーの暗号化に失敗しました')
      }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData,
    })

    revalidatePath('/admin/settings')
    return createSuccess('Resend設定を更新しました')
  }
)

/**
 * Resend接続テスト
 */
export const testResendConnectionAction = withAuth(
  async (_user, apiKey: string) => {
    const result = await testResendConnection(apiKey)

    if (result.success) {
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          resendLastTestedAt: new Date(),
          resendConnectionStatus: 'connected',
        },
        update: {
          resendLastTestedAt: new Date(),
          resendConnectionStatus: 'connected',
        },
      })

      revalidatePath('/admin/settings')
      return createSuccess(result.message || '接続に成功しました', {
        message: result.message || '',
      })
    }

    // エラー時もステータス更新
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        resendLastTestedAt: new Date(),
        resendConnectionStatus: 'error',
      },
      update: {
        resendLastTestedAt: new Date(),
        resendConnectionStatus: 'error',
      },
    })

    revalidatePath('/admin/settings')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Resendキーをクリア
 */
export const clearResendKeys = withAuth(async (_user) => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      resendApiKey: null,
      resendLastTestedAt: null,
      resendConnectionStatus: null,
    },
  })

  revalidatePath('/admin/settings')
  return createSuccess('Resendキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Turnstile
// =============================================================================

/**
 * Turnstile設定を更新
 */
export const updateTurnstileSettings = withAuth(
  async (_user, data: TurnstileSettingsInput) => {
    const parsed = turnstileSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const updateData: Record<string, unknown> = {}

    if (parsed.data.turnstileSiteKey !== undefined) {
      updateData.turnstileSiteKey = parsed.data.turnstileSiteKey
    }

    if (parsed.data.turnstileSecretKey) {
      try {
        updateData.turnstileSecretKey = encrypt(parsed.data.turnstileSecretKey)
      } catch {
        return createFailure('シークレットキーの暗号化に失敗しました')
      }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData,
    })

    revalidatePath('/admin/settings')
    return createSuccess('Turnstile設定を更新しました')
  }
)

/**
 * Turnstile接続テスト
 */
export const testTurnstileConnectionAction = withAuth(
  async (_user, siteKey: string, secretKey: string) => {
    const result = await testTurnstileConnection(siteKey, secretKey)

    if (result.success) {
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          turnstileLastTestedAt: new Date(),
          turnstileConnectionStatus: 'connected',
        },
        update: {
          turnstileLastTestedAt: new Date(),
          turnstileConnectionStatus: 'connected',
        },
      })

      revalidatePath('/admin/settings')
      return createSuccess(result.message || '検証に成功しました', {
        message: result.message || '',
        note: result.metadata?.note as string | undefined,
      })
    }

    // エラー時もステータス更新
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        turnstileLastTestedAt: new Date(),
        turnstileConnectionStatus: 'error',
      },
      update: {
        turnstileLastTestedAt: new Date(),
        turnstileConnectionStatus: 'error',
      },
    })

    revalidatePath('/admin/settings')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Turnstileキーをクリア
 */
export const clearTurnstileKeys = withAuth(async (_user) => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      turnstileSiteKey: null,
      turnstileSecretKey: null,
      turnstileLastTestedAt: null,
      turnstileConnectionStatus: null,
    },
  })

  revalidatePath('/admin/settings')
  return createSuccess('Turnstileキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Google Maps
// =============================================================================

/**
 * Google Maps設定を更新
 */
export const updateGoogleMapsSettings = withAuth(
  async (_user, data: GoogleMapsSettingsInput) => {
    const parsed = googleMapsSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const updateData: Record<string, unknown> = {}

    if (parsed.data.googleMapsApiKey) {
      try {
        updateData.googleMapsApiKey = encrypt(parsed.data.googleMapsApiKey)
      } catch {
        return createFailure('APIキーの暗号化に失敗しました')
      }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData,
    })

    revalidatePath('/admin/settings')
    return createSuccess('Google Maps設定を更新しました')
  }
)

/**
 * Google Maps接続テスト
 */
export const testGoogleMapsConnectionAction = withAuth(
  async (_user, apiKey: string) => {
    const result = await testGoogleMapsConnection(apiKey)

    if (result.success) {
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          googleMapsLastTestedAt: new Date(),
          googleMapsConnectionStatus: 'connected',
        },
        update: {
          googleMapsLastTestedAt: new Date(),
          googleMapsConnectionStatus: 'connected',
        },
      })

      revalidatePath('/admin/settings')
      return createSuccess(result.message || '接続に成功しました', {
        message: result.message || '',
      })
    }

    // エラー時もステータス更新
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        googleMapsLastTestedAt: new Date(),
        googleMapsConnectionStatus: 'error',
      },
      update: {
        googleMapsLastTestedAt: new Date(),
        googleMapsConnectionStatus: 'error',
      },
    })

    revalidatePath('/admin/settings')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Google Mapsキーをクリア
 */
export const clearGoogleMapsKeys = withAuth(async (_user) => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleMapsApiKey: null,
      googleMapsLastTestedAt: null,
      googleMapsConnectionStatus: null,
    },
  })

  revalidatePath('/admin/settings')
  return createSuccess('Google Mapsキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Custom API Keys
// =============================================================================

/**
 * カスタムAPIキーを追加
 */
export const addCustomApiKey = withAuth(async (_user, data: CustomApiKeyInput) => {
  const parsed = customApiKeySchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { customApiKeys: true },
  })

  const existing = (settings?.customApiKeys as CustomApiKeysMap) || {}
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  let encryptedKeyValue: string
  try {
    encryptedKeyValue = encrypt(parsed.data.keyValue)
  } catch {
    return createFailure('APIキーの暗号化に失敗しました')
  }

  const newKey = {
    name: parsed.data.name,
    keyName: parsed.data.keyName,
    keyValue: encryptedKeyValue,
    description: parsed.data.description,
    createdAt: now,
    updatedAt: now,
  }

  const updated = { ...existing, [id]: newKey }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', customApiKeys: updated },
    update: { customApiKeys: updated },
  })

  revalidatePath('/admin/settings')
  return createSuccess('APIキーを追加しました')
})

/**
 * カスタムAPIキーを削除
 */
export const deleteCustomApiKey = withAuth(async (_user, id: string) => {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { customApiKeys: true },
  })

  const existing = (settings?.customApiKeys as CustomApiKeysMap) || {}

  if (!existing[id]) {
    return createFailure('指定されたAPIキーが見つかりません')
  }

  delete existing[id]

  await prisma.settings.update({
    where: { id: 'singleton' },
    data: { customApiKeys: existing },
  })

  revalidatePath('/admin/settings')
  return createSuccess('APIキーを削除しました')
})

/**
 * カスタムAPIキーの復号化された値を取得（内部使用のみ）
 */
export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  await requireAdmin()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { customApiKeys: true },
  })

  const keysMap = settings?.customApiKeys as CustomApiKeysMap | null
  if (!keysMap || !keysMap[id]) {
    return null
  }

  return safeDecrypt(keysMap[id].keyValue)
}
