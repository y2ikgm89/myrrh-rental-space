/**
 * Instagram API Utilities
 *
 * Instagram Graph API / Basic Display API を使用した機能群
 * トークン管理、フィード取得、oEmbed取得などのユーティリティ
 */

import type { ApiKeyTestResult } from '@/admin/types/api-keys'
import { isValidInstagramToken } from '@/admin/lib/validations/instagram'
import { maskApiKey } from '@/admin/lib/api-keys/helpers'

// =============================================================================
// Types
// =============================================================================

export type InstagramMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'

export interface InstagramMediaItem {
  id: string
  caption?: string
  mediaType: InstagramMediaType
  mediaUrl: string
  permalink: string
  thumbnailUrl?: string
  timestamp: string
}

export interface InstagramUserInfo {
  id: string
  username: string
  accountType: string
  mediaCount?: number
}

export interface InstagramOembedResponse {
  html: string
  width: number
  height?: number
  authorName?: string
  providerName: string
}

interface InstagramApiMedia {
  id: string
  caption?: string
  media_type: InstagramMediaType
  media_url: string
  permalink: string
  thumbnail_url?: string
  timestamp: string
}

interface InstagramApiFeedResponse {
  data: InstagramApiMedia[]
  paging?: {
    cursors?: {
      after?: string
      before?: string
    }
    next?: string
  }
}

interface InstagramApiUserResponse {
  id: string
  username: string
  account_type: string
  media_count?: number
}

interface InstagramApiError {
  error?: {
    message: string
    type: string
    code: number
  }
}

// =============================================================================
// API Base URL
// =============================================================================

const INSTAGRAM_GRAPH_API_BASE = 'https://graph.instagram.com'
const INSTAGRAM_OEMBED_API = 'https://graph.facebook.com/v18.0/instagram_oembed'
const INSTAGRAM_OAUTH_BASE = 'https://api.instagram.com/oauth'

// =============================================================================
// Feed Functions
// =============================================================================

/**
 * Instagramフィードを取得
 *
 * @param accessToken - Instagram Basic Display APIアクセストークン
 * @param limit - 取得する投稿数（デフォルト: 12、最大: 24）
 * @returns フィードアイテム配列
 */
export async function fetchInstagramFeed(
  accessToken: string,
  limit = 12
): Promise<InstagramMediaItem[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 24)

  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me/media`)
  url.searchParams.set('fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp')
  url.searchParams.set('limit', String(clampedLimit))
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 }, // 1時間キャッシュ
  })

  if (!response.ok) {
    const errorData = (await response.json()) as InstagramApiError
    throw new Error(
      errorData.error?.message || `Instagram API error: ${response.status}`
    )
  }

  const data = (await response.json()) as InstagramApiFeedResponse

  return data.data.map((item) => ({
    id: item.id,
    caption: item.caption,
    mediaType: item.media_type,
    mediaUrl: item.media_url,
    permalink: item.permalink,
    thumbnailUrl: item.thumbnail_url,
    timestamp: item.timestamp,
  }))
}

// =============================================================================
// oEmbed Functions
// =============================================================================

/**
 * Instagram投稿のoEmbed HTMLを取得
 *
 * @param postUrl - Instagram投稿URL
 * @param accessToken - Facebook App Access Token
 * @returns oEmbedレスポンス
 */
export async function fetchInstagramOembed(
  postUrl: string,
  accessToken: string
): Promise<InstagramOembedResponse> {
  const url = new URL(INSTAGRAM_OEMBED_API)
  url.searchParams.set('url', postUrl)
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('omitscript', 'true') // クライアント側でscriptを制御

  const response = await fetch(url.toString())

  if (!response.ok) {
    const errorData = (await response.json()) as InstagramApiError
    throw new Error(
      errorData.error?.message || `oEmbed API error: ${response.status}`
    )
  }

  const data = (await response.json()) as {
    html: string
    width: number
    height?: number
    author_name?: string
    provider_name: string
  }

  return {
    html: data.html,
    width: data.width,
    height: data.height,
    authorName: data.author_name,
    providerName: data.provider_name,
  }
}

// =============================================================================
// OAuth Token Exchange Functions
// =============================================================================

/**
 * 認証コードを短期トークンに交換
 *
 * @param code - OAuth認証コード
 * @param clientId - Instagram App ID
 * @param clientSecret - Instagram App Secret
 * @param redirectUri - リダイレクトURI
 * @returns 短期アクセストークン
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(`${INSTAGRAM_OAUTH_BASE}/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!response.ok) {
    const errorData = (await response.json()) as InstagramApiError
    throw new Error(
      errorData.error?.message || `Token exchange failed: ${response.status}`
    )
  }

  const data = (await response.json()) as {
    access_token: string
    user_id: number
  }

  return {
    accessToken: data.access_token,
    userId: String(data.user_id),
  }
}

/**
 * 短期トークンを長期トークンに交換
 *
 * @param shortLivedToken - 短期アクセストークン
 * @param clientSecret - Instagram App Secret
 * @returns 長期アクセストークンと有効期限
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/access_token`)
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', clientSecret)
  url.searchParams.set('access_token', shortLivedToken)

  const response = await fetch(url.toString())

  if (!response.ok) {
    const errorData = (await response.json()) as InstagramApiError
    throw new Error(
      errorData.error?.message ||
        `Long-lived token exchange failed: ${response.status}`
    )
  }

  const data = (await response.json()) as {
    access_token: string
    token_type: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in, // 秒単位（通常60日）
  }
}

/**
 * 長期トークンをリフレッシュ
 *
 * @param longLivedToken - 長期アクセストークン
 * @returns 新しい長期アクセストークンと有効期限
 */
export async function refreshLongLivedToken(
  longLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/refresh_access_token`)
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', longLivedToken)

  const response = await fetch(url.toString())

  if (!response.ok) {
    const errorData = (await response.json()) as InstagramApiError
    throw new Error(
      errorData.error?.message || `Token refresh failed: ${response.status}`
    )
  }

  const data = (await response.json()) as {
    access_token: string
    token_type: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

// =============================================================================
// User Info Functions
// =============================================================================

/**
 * Instagramユーザー情報を取得
 *
 * @param accessToken - Instagram Basic Display APIアクセストークン
 * @returns ユーザー情報
 */
export async function fetchInstagramUserInfo(
  accessToken: string
): Promise<InstagramUserInfo> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me`)
  url.searchParams.set('fields', 'id,username,account_type,media_count')
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url.toString())

  if (!response.ok) {
    const errorData = (await response.json()) as InstagramApiError
    throw new Error(
      errorData.error?.message || `User info fetch failed: ${response.status}`
    )
  }

  const data = (await response.json()) as InstagramApiUserResponse

  return {
    id: data.id,
    username: data.username,
    accountType: data.account_type,
    mediaCount: data.media_count,
  }
}

// =============================================================================
// Connection Test
// =============================================================================

/**
 * Instagram接続をテスト
 *
 * @param accessToken - Instagram Basic Display APIアクセストークン
 * @returns テスト結果
 */
export async function testInstagramConnection(
  accessToken: string
): Promise<ApiKeyTestResult> {
  if (!isValidInstagramToken(accessToken)) {
    return {
      success: false,
      error: 'トークンの形式が正しくありません',
    }
  }

  try {
    const userInfo = await fetchInstagramUserInfo(accessToken)

    return {
      success: true,
      message: `@${userInfo.username} として接続されています`,
      metadata: {
        userId: userInfo.id,
        username: userInfo.username,
        accountType: userInfo.accountType,
        mediaCount: userInfo.mediaCount,
      },
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '接続テストに失敗しました'

    // よくあるエラーパターンをユーザーフレンドリーに変換
    if (message.includes('Invalid OAuth access token')) {
      return {
        success: false,
        error:
          'アクセストークンが無効です。トークンの有効期限が切れている可能性があります',
      }
    }

    if (message.includes('Error validating access token')) {
      return {
        success: false,
        error: 'トークンの検証に失敗しました。再認証が必要です',
      }
    }

    return {
      success: false,
      error: message,
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Instagramトークンをマスク表示用に変換
 */
export function maskInstagramToken(token: string): string {
  return maskApiKey(token, 8, 4)
}

/**
 * トークンの有効期限までの残り日数を計算
 */
export function getTokenExpiryDays(expiresAt: Date): number {
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * トークンがリフレッシュ必要かどうかを判定
 * 有効期限の7日前からリフレッシュ推奨
 */
export function shouldRefreshToken(expiresAt: Date): boolean {
  const daysRemaining = getTokenExpiryDays(expiresAt)
  return daysRemaining <= 7
}
