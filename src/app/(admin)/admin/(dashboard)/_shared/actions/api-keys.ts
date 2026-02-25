'use server'

/**
 * External Service API Keys Server Actions
 *
 * 外部サービスAPIキーの管理用Server Actions
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { encrypt, safeDecrypt } from '@/shared/lib/crypto'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { isRecord } from '@/shared/lib/serialize'
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
  maskGoogleOAuthSecret,
  testResendConnection,
  testTurnstileConnection,
  testGoogleMapsConnection,
  testCloudflareConnection,
  testGoogleOAuthConnection,
} from '@/admin/lib/api-keys'
import { resetAuthInstance } from '@/shared/lib/auth'
import {
  googleOAuthSettingsSchema,
  type GoogleOAuthSettingsInput,
} from '@/admin/lib/validations/api-keys'
import type {
  ResendConfig,
  TurnstileConfig,
  GoogleMapsConfig,
  CloudflareConfig,
  GoogleOAuthConfig,
  CustomApiKeyData,
  CustomApiKeysMap,
  CustomApiKeyStored,
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
function isCustomApiKeyStored(value: unknown): value is CustomApiKeyStored {
  if (!isRecord(value)) return false
  return (
    typeof value['name'] === 'string' &&
    typeof value['keyName'] === 'string' &&
    typeof value['keyValue'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string'
  )
}

/**
 * unknownからCustomApiKeysMapを安全にパースする
 * PrismaのJSONフィールドから取得した値を型安全に扱う
 */
function parseCustomApiKeysMap(value: unknown): CustomApiKeysMap {
  if (!isRecord(value)) return {}

  const result: CustomApiKeysMap = {}

  for (const [key, entry] of Object.entries(value)) {
    if (isCustomApiKeyStored(entry)) {
      result[key] = entry
    }
  }

  return result
}

// =============================================================================
// GET Actions
// =============================================================================

const checkSettingsReadPermission = checkReadPermissionFor('settings')

/**
 * Resend設定を取得
 */
export async function getResendConfig(): Promise<ResendConfig> {
  if (!(await checkSettingsReadPermission())) {
    return { apiKeyMasked: null, lastTestedAt: null, connectionStatus: null }
  }

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
  if (!(await checkSettingsReadPermission())) {
    return { siteKey: null, secretKeyMasked: null, lastTestedAt: null, connectionStatus: null }
  }

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
  if (!(await checkSettingsReadPermission())) {
    return { apiKeyMasked: null, lastTestedAt: null, connectionStatus: null }
  }

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
  if (!(await checkSettingsReadPermission())) return []

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
export const updateResendSettings = withPermission<[ResendSettingsInput]>(
  'settings',
  'update'
)(async (_user, data) => {
  const parsed = resendSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const updateData: Record<string, unknown> = {}

  if (parsed.data.resendApiKey) {
    try {
      updateData['resendApiKey'] = encrypt(parsed.data.resendApiKey)
    } catch {
      return createFailure('APIキーの暗号化に失敗しました')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Resend設定を更新しました')
})

/**
 * Resend接続テスト
 */
export const testResendConnectionAction = withPermission<[string], { message: string }>(
  'settings',
  'update'
)(async (_user, apiKey) => {
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

    updateTag(CACHE_TAGS.SETTINGS)
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

  updateTag(CACHE_TAGS.SETTINGS)
  return createFailure(result.error || '接続テストに失敗しました')
})

/**
 * Resendキーをクリア
 */
export const clearResendKeys = withPermission<[]>(
  'settings',
  'update'
)(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      resendApiKey: null,
      resendLastTestedAt: null,
      resendConnectionStatus: null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Resendキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Turnstile
// =============================================================================

/**
 * Turnstile設定を更新
 */
export const updateTurnstileSettings = withPermission<[TurnstileSettingsInput]>(
  'settings',
  'update'
)(async (_user, data) => {
  const parsed = turnstileSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const updateData: Record<string, unknown> = {}

  if (parsed.data.turnstileSiteKey !== undefined) {
    updateData['turnstileSiteKey'] = parsed.data.turnstileSiteKey
  }

  if (parsed.data.turnstileSecretKey) {
    try {
      updateData['turnstileSecretKey'] = encrypt(parsed.data.turnstileSecretKey)
    } catch {
      return createFailure('シークレットキーの暗号化に失敗しました')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Turnstile設定を更新しました')
})

/**
 * Turnstile接続テスト
 */
export const testTurnstileConnectionAction = withPermission<
  [string, string],
  { message: string; note?: string }
>(
  'settings',
  'update'
)(async (_user, siteKey, secretKey) => {
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

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess(result.message || '検証に成功しました', {
      message: result.message || '',
      note: typeof result.metadata?.['note'] === 'string' ? result.metadata?.['note'] : undefined,
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

  updateTag(CACHE_TAGS.SETTINGS)
  return createFailure(result.error || '接続テストに失敗しました')
})

/**
 * Turnstileキーをクリア
 */
export const clearTurnstileKeys = withPermission<[]>(
  'settings',
  'update'
)(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      turnstileSiteKey: null,
      turnstileSecretKey: null,
      turnstileLastTestedAt: null,
      turnstileConnectionStatus: null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Turnstileキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Google Maps
// =============================================================================

/**
 * Google Maps設定を更新
 */
export const updateGoogleMapsSettings = withPermission<[GoogleMapsSettingsInput]>(
  'settings',
  'update'
)(async (_user, data) => {
  const parsed = googleMapsSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const updateData: Record<string, unknown> = {}

  if (parsed.data.googleMapsApiKey) {
    try {
      updateData['googleMapsApiKey'] = encrypt(parsed.data.googleMapsApiKey)
    } catch {
      return createFailure('APIキーの暗号化に失敗しました')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Google Maps設定を更新しました')
})

/**
 * Google Maps接続テスト
 */
export const testGoogleMapsConnectionAction = withPermission<[string], { message: string }>(
  'settings',
  'update'
)(async (_user, apiKey) => {
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

    updateTag(CACHE_TAGS.SETTINGS)
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

  updateTag(CACHE_TAGS.SETTINGS)
  return createFailure(result.error || '接続テストに失敗しました')
})

/**
 * Google Mapsキーをクリア
 */
export const clearGoogleMapsKeys = withPermission<[]>(
  'settings',
  'update'
)(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleMapsApiKey: null,
      googleMapsLastTestedAt: null,
      googleMapsConnectionStatus: null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Google Mapsキーをクリアしました')
})

// =============================================================================
// UPDATE Actions - Cloudflare CDN
// =============================================================================

/**
 * Cloudflare設定を取得
 */
export async function getCloudflareConfig(): Promise<CloudflareConfig> {
  if (!(await checkSettingsReadPermission())) {
    return { zoneId: null, apiTokenMasked: null, lastTestedAt: null, connectionStatus: null }
  }

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
export const updateCloudflareSettings = withPermission<[CloudflareSettingsInput]>(
  'settings',
  'update'
)(async (_user, data) => {
  const parsed = cloudflareSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const updateData: Record<string, unknown> = {}

  if (parsed.data.cloudflareZoneId !== undefined) {
    updateData['cloudflareZoneId'] = parsed.data.cloudflareZoneId
  }

  if (parsed.data.cloudflareApiToken) {
    try {
      updateData['cloudflareApiToken'] = encrypt(parsed.data.cloudflareApiToken)
    } catch {
      return createFailure('API Tokenの暗号化に失敗しました')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Cloudflare設定を更新しました')
})

/**
 * Cloudflare接続テスト
 */
export const testCloudflareConnectionAction = withPermission<
  [string, string],
  { message: string; zoneName?: string; plan?: string }
>(
  'settings',
  'update'
)(async (_user, zoneId, apiToken) => {
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

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess(result.message || '接続に成功しました', {
      message: result.message || '',
      zoneName: typeof result.metadata?.['zoneName'] === 'string' ? result.metadata?.['zoneName'] : undefined,
      plan: typeof result.metadata?.['plan'] === 'string' ? result.metadata?.['plan'] : undefined,
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

  updateTag(CACHE_TAGS.SETTINGS)
  return createFailure(result.error || '接続テストに失敗しました')
})

/**
 * Cloudflareキーをクリア
 */
export const clearCloudflareKeys = withPermission<[]>(
  'settings',
  'update'
)(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      cloudflareZoneId: null,
      cloudflareApiToken: null,
      cloudflareLastTestedAt: null,
      cloudflareConnectionStatus: null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Cloudflare設定をクリアしました')
})

// =============================================================================
// UPDATE Actions - Custom API Keys
// =============================================================================

/**
 * カスタムAPIキーを追加
 */
export const addCustomApiKey = withPermission<[CustomApiKeyInput]>(
  'settings',
  'update'
)(async (_user, data) => {
  const parsed = customApiKeySchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
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

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('APIキーを追加しました')
})

/**
 * カスタムAPIキーを削除
 */
export const deleteCustomApiKey = withPermission<[string]>(
  'settings',
  'update'
)(async (_user, id) => {
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

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('APIキーを削除しました')
})

/**
 * カスタムAPIキーの復号化された値を取得（内部使用のみ）
 */
export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  if (!(await checkSettingsReadPermission())) return null

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

// =============================================================================
// Google OAuth (ログイン & カレンダー共通)
// =============================================================================

/**
 * Google OAuth設定を取得
 */
export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
  if (!(await checkSettingsReadPermission())) {
    return { clientId: null, clientSecretMasked: null, lastTestedAt: null, connectionStatus: null }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleOAuthClientId: true,
      googleOAuthClientSecret: true,
      googleOAuthLastTestedAt: true,
      googleOAuthConnectionStatus: true,
    },
  })

  return {
    clientId: settings?.googleOAuthClientId || null,
    clientSecretMasked: settings?.googleOAuthClientSecret
      ? maskGoogleOAuthSecret(safeDecrypt(settings.googleOAuthClientSecret) || '****')
      : null,
    lastTestedAt: settings?.googleOAuthLastTestedAt || null,
    connectionStatus: parseConnectionStatus(settings?.googleOAuthConnectionStatus),
  }
}

/**
 * Google OAuth設定を更新
 */
export const updateGoogleOAuthSettings = withPermission<[GoogleOAuthSettingsInput]>(
  'settings',
  'update'
)(async (_user, data) => {
  const parsed = googleOAuthSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const updateData: Record<string, unknown> = {}

  if (parsed.data.googleOAuthClientId !== undefined) {
    updateData['googleOAuthClientId'] = parsed.data.googleOAuthClientId
  }

  if (parsed.data.googleOAuthClientSecret) {
    try {
      updateData['googleOAuthClientSecret'] = encrypt(parsed.data.googleOAuthClientSecret)
    } catch {
      return createFailure('Client Secretの暗号化に失敗しました')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  // Auth インスタンスを再構築させる
  resetAuthInstance()

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Google OAuth設定を更新しました')
})

/**
 * Google OAuth接続テスト
 */
export const testGoogleOAuthConnectionAction = withPermission<
  [string, string],
  { message: string }
>(
  'settings',
  'update'
)(async (_user, clientId, clientSecret) => {
  const result = await testGoogleOAuthConnection(clientId, clientSecret)

  if (result.success) {
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        googleOAuthLastTestedAt: new Date(),
        googleOAuthConnectionStatus: 'connected',
      },
      update: {
        googleOAuthLastTestedAt: new Date(),
        googleOAuthConnectionStatus: 'connected',
      },
    })

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess(result.message || '接続に成功しました', {
      message: result.message || '',
    })
  }

  // エラー時もステータス更新
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      googleOAuthLastTestedAt: new Date(),
      googleOAuthConnectionStatus: 'error',
    },
    update: {
      googleOAuthLastTestedAt: new Date(),
      googleOAuthConnectionStatus: 'error',
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  return createFailure(result.error || '接続テストに失敗しました')
})

/**
 * Google OAuth設定をクリア
 */
export const clearGoogleOAuthKeys = withPermission<[]>(
  'settings',
  'update'
)(async () => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleOAuthClientId: null,
      googleOAuthClientSecret: null,
      googleOAuthLastTestedAt: null,
      googleOAuthConnectionStatus: null,
    },
  })

  // Auth インスタンスを再構築させる（環境変数フォールバックに戻る）
  resetAuthInstance()

  updateTag(CACHE_TAGS.SETTINGS)
  return createSuccess('Google OAuth設定をクリアしました')
})
