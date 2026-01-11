/**
 * Google Calendar API 統合
 *
 * サービスアカウントを使用して共有カレンダーに予約を自動登録
 * OAuth連携で管理者の個人カレンダーにも追加可能
 */

import { google, calendar_v3 } from 'googleapis'
import { safeDecrypt, encryptApiKey } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

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
    console.error('Failed to decrypt service account credentials')
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
    console.error('Failed to initialize Google Calendar client:', error)
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
      provider: 'google',
    },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  })

  if (!account?.access_token) {
    return null
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token ?? undefined,
      expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
    })

    // トークンリフレッシュのハンドラー
    const accountId = account.id
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        // refresh_tokenも更新（Googleがローテーションした場合に備える）
        await prisma.account.update({
          where: { id: accountId },
          data: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? undefined,
            expires_at: tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : undefined,
          },
        })
      }
    })

    return google.calendar({ version: 'v3', auth: oauth2Client })
  } catch (error) {
    console.error('Failed to initialize OAuth client:', error)
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
    console.error('Failed to create calendar event:', error)
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
    console.error('Failed to update calendar event:', error)
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
    console.error('Failed to delete calendar event:', error)
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
    console.error('Failed to create OAuth calendar event:', error)
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
    console.error('Google Calendar connection test failed:', error)
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
    console.error('OAuth connection test failed:', error)
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
