'use server'

/**
 * External Service API Keys Server Actions
 *
 * 外部サービスAPIキーの管理用Server Actions
 */

import { prisma } from '@/shared/lib/prisma'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { withAuth } from '@/admin/lib/server-action-helpers'
import { encrypt, safeDecrypt } from '@/shared/lib/crypto'
import { verifyAdminSession } from '@/shared/lib/auth'
import {
  resendSettingsSchema,
  turnstileSettingsSchema,
  googleMapsSettingsSchema,
  cloudflareSettingsSchema,
  customApiKeySchema,
  type ResendSettingsInput,
  type TurnstileSettingsInput,
  type GoogleMapsSettingsInput,
  type CloudflareSettingsInput,
  type CustomApiKeyInput,
} from '@/admin/lib/validations/api-keys'
import {
  maskResendKey,
  maskTurnstileKey,
  maskGoogleMapsKey,
  maskCloudflareToken,
  testResendConnection,
  testTurnstileConnection,
  testGoogleMapsConnection,
  testCloudflareConnection,
} from '@/admin/lib/api-keys'
import type {
  ResendConfig,
  TurnstileConfig,
  GoogleMapsConfig,
  CloudflareConfig,
  CustomApiKeyData,
  CustomApiKeysMap,
} from '@/admin/types/api-keys'

// =============================================================================
// Type Guards
// =============================================================================

/**
 * ConnectionStatus型ガード
 */
type ConnectionStatus = 'connected' | 'error'

function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return value === 'connected' || value === 'error'
}

function parseConnectionStatus(value: unknown): ConnectionStatus | null {
  return isConnectionStatus(value) ? value : null
}

/**
 * CustomApiKeyStoredの型ガード
 * 必須フィールドの存在と型を検証
 */
function isCustomApiKeyStored(value: unknown): value is import('@/admin/types/api-keys').CustomApiKeyStored {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    typeof obj.keyName === 'string' &&
    typeof obj.keyValue === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  )
}

/**
 * unknownからCustomApiKeysMapを安全にパースする
 * PrismaのJSONフィールドから取得した値を型安全に扱う
 */
function parseCustomApiKeysMap(value: unknown): CustomApiKeysMap {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return {}

  const result: CustomApiKeysMap = {}
  const entries = Object.entries(value as Record<string, unknown>)

  for (const [key, entry] of entries) {
    if (isCustomApiKeyStored(entry)) {
      result[key] = entry
    }
  }

  return result
}

// =============================================================================
// GET Actions
// =============================================================================

/**
 * Resend設定を取得
 */
export async function getResendConfig(): Promise<ResendConfig> {
  await verifyAdminSession()

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
    connectionStatus: parseConnectionStatus(settings?.resendConnectionStatus),
  }
}

/**
 * Turnstile設定を取得
 */
export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  await verifyAdminSession()

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
    connectionStatus: parseConnectionStatus(settings?.turnstileConnectionStatus),
  }
}

/**
 * Google Maps設定を取得
 */
export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  await verifyAdminSession()

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
    connectionStatus: parseConnectionStatus(settings?.googleMapsConnectionStatus),
  }
}

/**
 * カスタムAPIキー一覧を取得
 */
export async function getCustomApiKeys(): Promise<CustomApiKeyData[]> {
  await verifyAdminSession()

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

  const keysMap = parseCustomApiKeysMap(settings.customApiKeys)
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

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

      revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Resendキーをクリア
 */
export const clearResendKeys = withAuth(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      resendApiKey: null,
      resendLastTestedAt: null,
      resendConnectionStatus: null,
    },
  })

  revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

      revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Turnstileキーをクリア
 */
export const clearTurnstileKeys = withAuth(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      turnstileSiteKey: null,
      turnstileSecretKey: null,
      turnstileLastTestedAt: null,
      turnstileConnectionStatus: null,
    },
  })

  revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

      revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Google Mapsキーをクリア
 */
export const clearGoogleMapsKeys = withAuth(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleMapsApiKey: null,
      googleMapsLastTestedAt: null,
      googleMapsConnectionStatus: null,
    },
  })

  revalidateTag(CACHE_TAGS.SETTINGS, 'default')
  return createSuccess('Google Mapsキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Cloudflare CDN
// =============================================================================

/**
 * Cloudflare設定を取得
 */
export async function getCloudflareConfig(): Promise<CloudflareConfig> {
  await verifyAdminSession()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      cloudflareZoneId: true,
      cloudflareApiToken: true,
      cloudflareLastTestedAt: true,
      cloudflareConnectionStatus: true,
    },
  })

  return {
    zoneId: settings?.cloudflareZoneId || null,
    apiTokenMasked: settings?.cloudflareApiToken
      ? maskCloudflareToken(safeDecrypt(settings.cloudflareApiToken) || '****')
      : null,
    lastTestedAt: settings?.cloudflareLastTestedAt || null,
    connectionStatus: parseConnectionStatus(settings?.cloudflareConnectionStatus),
  }
}

/**
 * Cloudflare設定を更新
 */
export const updateCloudflareSettings = withAuth(
  async (_user, data: CloudflareSettingsInput) => {
    const parsed = cloudflareSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const updateData: Record<string, unknown> = {}

    if (parsed.data.cloudflareZoneId !== undefined) {
      updateData.cloudflareZoneId = parsed.data.cloudflareZoneId
    }

    if (parsed.data.cloudflareApiToken) {
      try {
        updateData.cloudflareApiToken = encrypt(parsed.data.cloudflareApiToken)
      } catch {
        return createFailure('API Tokenの暗号化に失敗しました')
      }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData,
    })

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
    return createSuccess('Cloudflare設定を更新しました')
  }
)

/**
 * Cloudflare接続テスト
 */
export const testCloudflareConnectionAction = withAuth(
  async (_user, zoneId: string, apiToken: string) => {
    const result = await testCloudflareConnection(zoneId, apiToken)

    if (result.success) {
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          cloudflareLastTestedAt: new Date(),
          cloudflareConnectionStatus: 'connected',
        },
        update: {
          cloudflareLastTestedAt: new Date(),
          cloudflareConnectionStatus: 'connected',
        },
      })

      revalidateTag(CACHE_TAGS.SETTINGS, 'default')
      return createSuccess(result.message || '接続に成功しました', {
        message: result.message || '',
        zoneName: result.metadata?.zoneName as string | undefined,
        plan: result.metadata?.plan as string | undefined,
      })
    }

    // エラー時もステータス更新
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        cloudflareLastTestedAt: new Date(),
        cloudflareConnectionStatus: 'error',
      },
      update: {
        cloudflareLastTestedAt: new Date(),
        cloudflareConnectionStatus: 'error',
      },
    })

    revalidateTag(CACHE_TAGS.SETTINGS, 'default')
    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Cloudflareキーをクリア
 */
export const clearCloudflareKeys = withAuth(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      cloudflareZoneId: null,
      cloudflareApiToken: null,
      cloudflareLastTestedAt: null,
      cloudflareConnectionStatus: null,
    },
  })

  revalidateTag(CACHE_TAGS.SETTINGS, 'default')
  return createSuccess('Cloudflare設定をクリアしました')
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

  const existing = parseCustomApiKeysMap(settings?.customApiKeys)
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

  revalidateTag(CACHE_TAGS.SETTINGS, 'default')
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

  const existing = parseCustomApiKeysMap(settings?.customApiKeys)

  if (!existing[id]) {
    return createFailure('指定されたAPIキーが見つかりません')
  }

  delete existing[id]

  await prisma.settings.update({
    where: { id: 'singleton' },
    data: { customApiKeys: existing },
  })

  revalidateTag(CACHE_TAGS.SETTINGS, 'default')
  return createSuccess('APIキーを削除しました')
})

/**
 * カスタムAPIキーの復号化された値を取得（内部使用のみ）
 */
export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  await verifyAdminSession()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { customApiKeys: true },
  })

  const keysMap = settings?.customApiKeys ? parseCustomApiKeysMap(settings.customApiKeys) : null
  if (!keysMap || !keysMap[id]) {
    return null
  }

  return safeDecrypt(keysMap[id].keyValue)
}
