/**
 * Google Calendar API 統合
 *
 * サービスアカウントを使用して共有カレンダーに予約を自動登録します。
 * OAuth連携で管理者の個人カレンダーにも追加可能です。
 *
 * ## 機能
 * - **サービスアカウント連携**: 共有カレンダーへの自動登録
 * - **OAuth連携**: 管理者の個人カレンダーへの追加
 * - **双方向同期**: カレンダー変更の検知と反映
 * - **Webhook**: リアルタイム変更通知
 *
 * ## 接続方式
 * - サービスアカウント: 共有カレンダーへの書き込み（推奨）
 * - OAuth: 管理者個人カレンダーへのアクセス
 *
 * @module shared/lib/google-calendar
 */

import 'server-only'
import { google, calendar_v3 } from 'googleapis'
import { serverEnv } from '@/shared/lib/env/server'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from './errors'
import { safeDecrypt, encryptApiKey } from '@/shared/lib/crypto'
import { prisma } from '@/shared/lib/prisma'
import { getGoogleOAuthCredentials } from '@/shared/lib/google-oauth-credentials'
import { CalendarSyncMethod } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export interface CalendarEventParams {
  summary: string
  description: string
  location?: string
  startTime: Date
  endTime: Date
  attendeeEmail?: string
}

export interface CalendarEventResult {
  success: boolean
  eventId?: string
  eventUrl?: string
  error?: string
}

export interface CalendarConnectionTestResult {
  success: boolean
  calendarName?: string
  accountEmail?: string
  error?: string
}

export interface GoogleCalendarSettings {
  enabled: boolean
  calendarId: string | null
  connectionStatus: 'connected' | 'error' | null
  lastTestedAt: Date | null
  oauthEnabled: boolean
}

// =============================================================================
// Service Account Client
// =============================================================================

/**
 * サービスアカウントのGoogle Calendar APIクライアントを取得
 */
export async function getServiceAccountClient(): Promise<calendar_v3.Calendar | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleCalendarEnabled: true,
      googleCalendarServiceAccountJson: true,
    },
  })

  if (
    !settings?.googleCalendarEnabled ||
    !settings.googleCalendarServiceAccountJson
  ) {
    return null
  }

  const decryptedJson = safeDecrypt(settings.googleCalendarServiceAccountJson)
  if (!decryptedJson) {
    logError(new Error('Failed to decrypt service account credentials'), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'getServiceAccountClient' },
    })
    return null
  }

  try {
    const credentials = JSON.parse(decryptedJson)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    })

    return google.calendar({ version: 'v3', auth })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'getServiceAccountClient' },
    })
    return null
  }
}

/**
 * OAuth連携されている管理者のGoogle Calendar APIクライアントを取得
 */
export async function getOAuthClient(
  userId: string
): Promise<calendar_v3.Calendar | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: 'google',
    },
    select: {
      id: true,
      accountId: true,
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
    },
  })

  if (!account?.accessToken) {
    return null
  }

  try {
    const credentials = await getGoogleOAuthCredentials()
    if (!credentials) {
      return null
    }

    const oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret
    )

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken ?? undefined,
      expiry_date: account.accessTokenExpiresAt
        ? account.accessTokenExpiresAt.getTime()
        : undefined,
    })

    // トークンリフレッシュのハンドラー
    const accountId = account.id
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        // refreshTokenも更新（Googleがローテーションした場合に備える）
        await prisma.account.update({
          where: { id: accountId },
          data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? undefined,
            accessTokenExpiresAt: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : undefined,
          },
        })
      }
    })

    return google.calendar({ version: 'v3', auth: oauth2Client })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'getOAuthClient', userId },
    })
    return null
  }
}

// =============================================================================
// Calendar Operations
// =============================================================================

/**
 * カレンダーにイベントを作成
 */
export async function createCalendarEvent(
  params: CalendarEventParams
): Promise<CalendarEventResult> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, error: 'Google Calendar is not configured' }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { googleCalendarId: true },
  })

  if (!settings?.googleCalendarId) {
    return { success: false, error: 'Calendar ID is not configured' }
  }

  try {
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: params.endTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
      attendees: params.attendeeEmail
        ? [{ email: params.attendeeEmail }]
        : undefined,
    }

    const response = await client.events.insert({
      calendarId: settings.googleCalendarId,
      requestBody: event,
      sendUpdates: 'none', // 参加者に通知を送らない
    })

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createCalendarEvent', summary: params.summary },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

/**
 * カレンダーイベントを更新
 */
export async function updateCalendarEvent(
  eventId: string,
  params: CalendarEventParams
): Promise<CalendarEventResult> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, error: 'Google Calendar is not configured' }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { googleCalendarId: true },
  })

  if (!settings?.googleCalendarId) {
    return { success: false, error: 'Calendar ID is not configured' }
  }

  try {
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: params.endTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
    }

    const response = await client.events.update({
      calendarId: settings.googleCalendarId,
      eventId,
      requestBody: event,
      sendUpdates: 'none',
    })

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updateCalendarEvent', eventId },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

/**
 * カレンダーイベントを削除
 */
export async function deleteCalendarEvent(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, error: 'Google Calendar is not configured' }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { googleCalendarId: true },
  })

  if (!settings?.googleCalendarId) {
    return { success: false, error: 'Calendar ID is not configured' }
  }

  try {
    await client.events.delete({
      calendarId: settings.googleCalendarId,
      eventId,
      sendUpdates: 'none',
    })

    return { success: true }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteCalendarEvent', eventId },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

/**
 * OAuth連携された管理者の個人カレンダーにイベントを作成
 */
export async function createOAuthCalendarEvent(
  userId: string,
  params: CalendarEventParams
): Promise<CalendarEventResult> {
  const client = await getOAuthClient(userId)
  if (!client) {
    return { success: false, error: 'OAuth is not connected' }
  }

  try {
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: params.endTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
    }

    const response = await client.events.insert({
      calendarId: 'primary',
      requestBody: event,
    })

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createOAuthCalendarEvent', userId, summary: params.summary },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

// =============================================================================
// Connection Test
// =============================================================================

/**
 * サービスアカウントの接続テスト
 */
export async function testServiceAccountConnection(params: {
  serviceAccountJson: string
  calendarId: string
}): Promise<CalendarConnectionTestResult> {
  try {
    const credentials = JSON.parse(params.serviceAccountJson)

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    })

    const calendar = google.calendar({ version: 'v3', auth })

    // カレンダーのメタデータを取得して接続確認
    const response = await calendar.calendars.get({
      calendarId: params.calendarId,
    })

    return {
      success: true,
      calendarName: response.data.summary ?? undefined,
      accountEmail: credentials.client_email,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'testServiceAccountConnection', calendarId: params.calendarId },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

/**
 * OAuth接続テスト
 */
export async function testOAuthConnection(
  userId: string
): Promise<CalendarConnectionTestResult> {
  const client = await getOAuthClient(userId)
  if (!client) {
    return { success: false, error: 'OAuth is not connected' }
  }

  try {
    const response = await client.calendars.get({
      calendarId: 'primary',
    })

    return {
      success: true,
      calendarName: response.data.summary ?? undefined,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'testOAuthConnection', userId },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

// =============================================================================
// Settings Management
// =============================================================================

/**
 * Google Calendar設定を取得
 */
export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleCalendarEnabled: true,
      googleCalendarId: true,
      googleCalendarConnectionStatus: true,
      googleCalendarLastTestedAt: true,
      googleCalendarOAuthEnabled: true,
    },
  })

  const connectionStatus = settings?.googleCalendarConnectionStatus
  const validStatus = connectionStatus === 'connected' || connectionStatus === 'error'
    ? connectionStatus
    : null

  return {
    enabled: settings?.googleCalendarEnabled ?? false,
    calendarId: settings?.googleCalendarId ?? null,
    connectionStatus: validStatus,
    lastTestedAt: settings?.googleCalendarLastTestedAt ?? null,
    oauthEnabled: settings?.googleCalendarOAuthEnabled ?? false,
  }
}

/**
 * Google Calendar接続が有効かどうか
 */
export async function isGoogleCalendarEnabled(): Promise<boolean> {
  const settings = await getGoogleCalendarSettings()
  return settings.enabled && settings.connectionStatus === 'connected'
}

// =============================================================================
// Two-Way Sync Operations (Phase 4)
// =============================================================================

export interface CalendarChange {
  eventId: string
  status: 'confirmed' | 'cancelled' | 'tentative'
  summary?: string
  startTime?: Date
  endTime?: Date
  updatedAt: Date
  deleted: boolean
}

export interface SyncChangesResult {
  success: boolean
  changes: CalendarChange[]
  newSyncToken?: string
  error?: string
}

/**
 * カレンダーの変更を取得（増分同期）
 *
 * syncTokenを使用して前回同期以降の変更のみを取得
 */
export async function fetchCalendarChanges(
  syncToken?: string | null
): Promise<SyncChangesResult> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, changes: [], error: 'Google Calendar is not configured' }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { googleCalendarId: true },
  })

  if (!settings?.googleCalendarId) {
    return { success: false, changes: [], error: 'Calendar ID is not configured' }
  }

  try {
    const changes: CalendarChange[] = []
    let pageToken: string | undefined
    let newSyncToken: string | undefined

    // syncTokenがない場合は初回同期（過去1ヶ月〜将来3ヶ月を取得）
    const now = new Date()
    const timeMin = new Date(now)
    timeMin.setMonth(timeMin.getMonth() - 1)
    const timeMax = new Date(now)
    timeMax.setMonth(timeMax.getMonth() + 3)

    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: settings.googleCalendarId,
        maxResults: 250,
        singleEvents: true,
        showDeleted: true, // 削除されたイベントも取得
      }

      if (syncToken) {
        params.syncToken = syncToken
      } else {
        // 初回同期時は時間範囲を指定
        params.timeMin = timeMin.toISOString()
        params.timeMax = timeMax.toISOString()
        params.orderBy = 'startTime'
      }

      if (pageToken) {
        params.pageToken = pageToken
      }

      const response = await client.events.list(params)

      for (const event of response.data.items || []) {
        if (!event.id) continue

        // 予約システムで作成されたイベントのみを対象（descriptionに予約IDが含まれる）
        const isReservationEvent = event.description?.includes('予約ID:')

        if (isReservationEvent) {
          changes.push({
            eventId: event.id,
            status: event.status === 'cancelled' ? 'cancelled' :
                    event.status === 'tentative' ? 'tentative' : 'confirmed',
            summary: event.summary ?? undefined,
            startTime: event.start?.dateTime ? new Date(event.start.dateTime) : undefined,
            endTime: event.end?.dateTime ? new Date(event.end.dateTime) : undefined,
            updatedAt: event.updated ? new Date(event.updated) : new Date(),
            deleted: event.status === 'cancelled',
          })
        }
      }

      pageToken = response.data.nextPageToken ?? undefined
      newSyncToken = response.data.nextSyncToken ?? undefined
    } while (pageToken)

    return {
      success: true,
      changes,
      newSyncToken,
    }
  } catch (error) {
    // syncTokenが期限切れの場合はフルシンク
    if (error instanceof Error && error.message.includes('410')) {
      return fetchCalendarChanges(null)
    }

    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'fetchCalendarChanges', hasSyncToken: !!syncToken },
    })
    return {
      success: false,
      changes: [],
      error: formatGoogleApiError(error),
    }
  }
}

/**
 * 特定のイベントを取得
 */
export async function getCalendarEvent(
  eventId: string
): Promise<{ success: boolean; event?: calendar_v3.Schema$Event; error?: string }> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, error: 'Google Calendar is not configured' }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { googleCalendarId: true },
  })

  if (!settings?.googleCalendarId) {
    return { success: false, error: 'Calendar ID is not configured' }
  }

  try {
    const response = await client.events.get({
      calendarId: settings.googleCalendarId,
      eventId,
    })

    return { success: true, event: response.data }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getCalendarEvent', eventId },
    })
    return { success: false, error: formatGoogleApiError(error) }
  }
}

// =============================================================================
// Webhook (Push Notifications) Operations
// =============================================================================

export interface WebhookSetupResult {
  success: boolean
  channelId?: string
  resourceId?: string
  expiration?: Date
  error?: string
}

/**
 * Webhook (Push Notifications) を設定
 */
export async function setupWebhookWatch(
  webhookUrl: string
): Promise<WebhookSetupResult> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, error: 'Google Calendar is not configured' }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { googleCalendarId: true },
  })

  if (!settings?.googleCalendarId) {
    return { success: false, error: 'Calendar ID is not configured' }
  }

  try {
    const channelId = crypto.randomUUID()
    const webhookToken = crypto.randomUUID() // 認証用トークン
    const expiration = new Date()
    expiration.setDate(expiration.getDate() + 7) // 7日間有効（最大）

    const response = await client.events.watch({
      calendarId: settings.googleCalendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        token: webhookToken, // x-goog-channel-token として送信される
        expiration: String(expiration.getTime()),
      },
    })

    // トークンをDBに保存
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { googleCalendarWebhookToken: webhookToken },
    })

    return {
      success: true,
      channelId: response.data.id ?? undefined,
      resourceId: response.data.resourceId ?? undefined,
      expiration: response.data.expiration
        ? new Date(parseInt(response.data.expiration))
        : undefined,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'setupWebhookWatch', webhookUrl },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

/**
 * Webhook (Push Notifications) を停止
 */
export async function stopWebhookWatch(
  channelId: string,
  resourceId: string
): Promise<{ success: boolean; error?: string }> {
  const client = await getServiceAccountClient()
  if (!client) {
    return { success: false, error: 'Google Calendar is not configured' }
  }

  try {
    await client.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    })

    return { success: true }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'stopWebhookWatch', channelId, resourceId },
    })
    return {
      success: false,
      error: formatGoogleApiError(error),
    }
  }
}

// =============================================================================
// Two-Way Sync Settings
// =============================================================================

export interface TwoWaySyncSettings {
  enabled: boolean
  syncMethod: CalendarSyncMethod
  pollingIntervalMin: number
  lastSyncedAt: Date | null
  webhookExpiration: Date | null
}

/**
 * 双方向同期設定を取得
 */
export async function getTwoWaySyncSettings(): Promise<TwoWaySyncSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleCalendarTwoWaySyncEnabled: true,
      googleCalendarSyncMethod: true,
      googleCalendarPollingIntervalMin: true,
      googleCalendarLastSyncedAt: true,
      googleCalendarWebhookExpiration: true,
    },
  })

  const syncMethod = settings?.googleCalendarSyncMethod
  const validMethod = syncMethod === CalendarSyncMethod.polling || syncMethod === CalendarSyncMethod.webhook || syncMethod === CalendarSyncMethod.both
    ? syncMethod
    : CalendarSyncMethod.polling

  return {
    enabled: settings?.googleCalendarTwoWaySyncEnabled ?? false,
    syncMethod: validMethod,
    pollingIntervalMin: settings?.googleCalendarPollingIntervalMin ?? 5,
    lastSyncedAt: settings?.googleCalendarLastSyncedAt ?? null,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  }
}

/**
 * 双方向同期が有効かどうか（ポーリング用）
 */
export async function isTwoWaySyncEnabled(): Promise<boolean> {
  const settings = await getTwoWaySyncSettings()
  const calendarEnabled = await isGoogleCalendarEnabled()
  return calendarEnabled && settings.enabled
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * サービスアカウントJSONを暗号化
 */
export function encryptServiceAccountJson(json: string): string {
  return encryptApiKey(json)
}

/**
 * サービスアカウントJSONからメールアドレスを抽出（マスク表示用）
 */
export function extractServiceAccountEmail(json: string): string | null {
  try {
    const parsed = JSON.parse(json)
    return parsed.client_email ?? null
  } catch {
    return null
  }
}

/**
 * カレンダーIDのバリデーション
 */
export function isValidCalendarId(calendarId: string): boolean {
  if (!calendarId) return false
  // カレンダーIDはメールアドレス形式または "primary"
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return calendarId === 'primary' || emailRegex.test(calendarId)
}

// =============================================================================
// Webhook Auto-Renewal
// =============================================================================

const WEBHOOK_RENEWAL_THRESHOLD_DAYS = 2

export interface WebhookRenewalResult {
  success: boolean
  renewed: boolean
  newExpiration?: Date
  error?: string
}

/**
 * Webhookの自動更新チェック
 *
 * 有効期限の2日前になったら自動的に更新
 * 既存のWebhookを停止し、新しいWebhookを設定
 */
export async function renewWebhookIfNeeded(): Promise<WebhookRenewalResult> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleCalendarWebhookExpiration: true,
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookResourceId: true,
      googleCalendarSyncMethod: true,
    },
  })

  // Webhookが設定されていない場合はスキップ
  if (!settings?.googleCalendarWebhookExpiration) {
    return { success: true, renewed: false }
  }

  // Webhook方式でない場合はスキップ
  if (settings.googleCalendarSyncMethod !== CalendarSyncMethod.webhook && settings.googleCalendarSyncMethod !== CalendarSyncMethod.both) {
    return { success: true, renewed: false }
  }

  // 2日前判定
  const now = new Date()
  const threshold = new Date(now)
  threshold.setDate(threshold.getDate() + WEBHOOK_RENEWAL_THRESHOLD_DAYS)

  if (settings.googleCalendarWebhookExpiration > threshold) {
    // まだ更新不要
    return { success: true, renewed: false }
  }

  try {
    // 既存Webhookを停止（エラーは無視 - Google側で自動期限切れになる）
    if (settings.googleCalendarWebhookChannelId && settings.googleCalendarWebhookResourceId) {
      await stopWebhookWatch(
        settings.googleCalendarWebhookChannelId,
        settings.googleCalendarWebhookResourceId
      ).catch((err) => {
        logError(normalizeError(err), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { operation: 'renewWebhookIfNeeded', note: 'old webhook stop failed (will expire automatically)' },
        })
      })
    }

    // 新しいWebhookを設定
    const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? serverEnv.BETTER_AUTH_URL
    if (!baseUrl) {
      return { success: false, renewed: false, error: 'APP_URL not configured' }
    }

    const webhookUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`
    const result = await setupWebhookWatch(webhookUrl)

    if (!result.success) {
      return { success: false, renewed: false, error: result.error }
    }

    // 設定を更新
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        googleCalendarWebhookChannelId: result.channelId,
        googleCalendarWebhookResourceId: result.resourceId,
        googleCalendarWebhookExpiration: result.expiration,
      },
    })

    return {
      success: true,
      renewed: true,
      newExpiration: result.expiration,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'renewWebhookIfNeeded' },
    })
    return {
      success: false,
      renewed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Google APIエラーをユーザーフレンドリーなメッセージに変換
 */
function formatGoogleApiError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('invalid_grant')) {
      return 'サービスアカウント認証情報が無効です'
    }
    if (message.includes('not found') || message.includes('notfound')) {
      return 'カレンダーが見つかりません。カレンダーIDを確認してください'
    }
    if (message.includes('forbidden') || message.includes('403')) {
      return 'カレンダーへのアクセス権限がありません。サービスアカウントに編集権限を付与してください'
    }
    if (message.includes('invalid_client')) {
      return 'クライアント認証に失敗しました'
    }
    if (message.includes('quota')) {
      return 'APIクォータを超過しました。しばらく待ってから再試行してください'
    }

    return error.message
  }

  return 'Google Calendarとの通信中にエラーが発生しました'
}
