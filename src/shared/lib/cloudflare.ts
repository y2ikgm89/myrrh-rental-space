/**
 * Cloudflare CDN Cache Purge
 *
 * Cloudflare APIを使用したキャッシュパージ機能
 * 管理画面での設定（Zone ID, API Token）をDBから取得して使用
 */

import 'server-only'
import { z } from 'zod'
import { getDecryptedCloudflareCredentials } from '@/shared/domain/settings/api-key-queries'
import { logger } from './logger'
import { getBaseUrl } from '@/shared/lib/constants'

interface PurgeResult {
  success: boolean
  error?: string
  purgedFiles?: number
}

// Cloudflare Zone ID: 32文字の16進数
const ZONE_ID_PATTERN = /^[a-f0-9]{32}$/i

function isValidZoneId(zoneId: string): boolean {
  return ZONE_ID_PATTERN.test(zoneId)
}

// Cloudflare API レスポンスのZodスキーマ
const cloudflareApiResponseSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.number(),
        message: z.string(),
      })
    )
    .optional(),
})

async function getCloudflareCredentials(): Promise<{
  zoneId: string
  apiToken: string
} | null> {
  const credentials = await getDecryptedCloudflareCredentials()
  if (!credentials) {
    return null
  }

  // Zone IDの形式検証
  if (!isValidZoneId(credentials.zoneId)) {
    logger.warn('Invalid Cloudflare Zone ID format')
    return null
  }

  return {
    zoneId: credentials.zoneId,
    apiToken: credentials.apiToken,
  }
}

async function callPurgeApi(
  zoneId: string,
  apiToken: string,
  body: Record<string, unknown>
): Promise<PurgeResult> {
  // Zone IDの二重検証（防御的プログラミング）
  if (!isValidZoneId(zoneId)) {
    return { success: false, error: 'Invalid Zone ID format' }
  }

  // URL APIを使用してSSRF対策（パスのエスケープ）
  const apiUrl = new URL(
    `/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
    'https://api.cloudflare.com'
  )

  try {
    const response = await fetch(
      apiUrl.toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      }
    )

    // HTTPステータスコードを先にチェック
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'API認証エラー: トークンの権限を確認してください',
        }
      }
      if (response.status === 429) {
        return {
          success: false,
          error: 'レート制限エラー: しばらく待ってから再試行してください',
        }
      }
      if (response.status >= 500) {
        return {
          success: false,
          error: 'Cloudflare APIサーバーエラー: 後ほど再試行してください',
        }
      }
      return {
        success: false,
        error: `HTTPエラー: ${response.status}`,
      }
    }

    // レスポンスのJSON解析と型検証
    const rawData: unknown = await response.json()
    const parseResult = cloudflareApiResponseSchema.safeParse(rawData)

    if (!parseResult.success) {
      logger.warn('Invalid Cloudflare API response format', {
        error: parseResult.error.message,
      })
      return { success: false, error: 'APIレスポンスの形式が不正です' }
    }

    const data = parseResult.data

    if (data.success) {
      return { success: true }
    }

    const errorMessage =
      data.errors?.[0]?.message || 'キャッシュパージに失敗しました'
    return { success: false, error: errorMessage }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { success: false, error: 'タイムアウトしました' }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    }
  }
}

/** 指定したURLのキャッシュをパージ */
export async function purgeCloudflareCache(
  urls: string[]
): Promise<PurgeResult> {
  const credentials = await getCloudflareCredentials()

  if (!credentials) {
    // Cloudflare設定がない場合は何もしない（エラーにはしない）
    logger.debug('Cloudflare credentials not configured, skipping cache purge')
    return { success: true }
  }

  if (urls.length === 0) {
    return { success: true }
  }

  // Cloudflare APIは1リクエストあたり最大30URLまで
  const MAX_URLS_PER_REQUEST = 30
  const batches: string[][] = []

  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    batches.push(urls.slice(i, i + MAX_URLS_PER_REQUEST))
  }

  // バッチを並列処理
  const results = await Promise.all(
    batches.map((batch) =>
      callPurgeApi(credentials.zoneId, credentials.apiToken, { files: batch })
    )
  )

  // 結果を集計
  let totalPurged = 0
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const batch = batches[i]
    if (!result || !batch) continue
    if (!result.success) {
      logger.warn('Cloudflare cache purge failed', {
        error: result.error,
        urls: batch,
        purgedBeforeFailure: totalPurged,
      })
      return { success: result.success, error: result.error, purgedFiles: totalPurged }
    }
    totalPurged += batch.length
  }

  logger.info('Cloudflare cache purged', { count: totalPurged })
  return { success: true, purgedFiles: totalPurged }
}

/**
 * プレフィックスに一致するURLのキャッシュをパージ（Enterprise機能）
 * 無料プランでは使用不可。その場合はpurgeAllCloudflareCacheを使用
 */
export async function purgeCloudflareCacheByPrefix(
  prefixes: string[]
): Promise<PurgeResult> {
  const credentials = await getCloudflareCredentials()

  if (!credentials) {
    logger.debug('Cloudflare credentials not configured, skipping cache purge')
    return { success: true }
  }

  if (prefixes.length === 0) {
    return { success: true }
  }

  const result = await callPurgeApi(credentials.zoneId, credentials.apiToken, {
    prefixes,
  })

  if (!result.success) {
    logger.warn('Cloudflare prefix cache purge failed', {
      error: result.error,
      prefixes,
    })
  }

  return result
}

/** 全キャッシュをパージ */
export async function purgeAllCloudflareCache(): Promise<PurgeResult> {
  const credentials = await getCloudflareCredentials()

  if (!credentials) {
    logger.debug('Cloudflare credentials not configured, skipping cache purge')
    return { success: true }
  }

  const result = await callPurgeApi(credentials.zoneId, credentials.apiToken, {
    purge_everything: true,
  })

  if (result.success) {
    logger.info('Cloudflare cache purged (all)')
  } else {
    logger.warn('Cloudflare cache purge (all) failed', { error: result.error })
  }

  return result
}

/** パス配列をフルURLに変換してキャッシュをパージ */
export async function purgeCloudflareByPaths(
  siteUrl: string,
  paths: string[]
): Promise<PurgeResult> {
  const urls = paths.map((path) => `${siteUrl}${path}`)
  return purgeCloudflareCache(urls)
}

function getSiteUrl(): string {
  return getBaseUrl()
}

function purgeContentCache(
  basePath: string,
  id?: string
): Promise<PurgeResult> {
  const siteUrl = getSiteUrl()
  const paths = [basePath, '/']
  if (id) {
    paths.push(`${basePath}/${id}`)
  }
  return purgeCloudflareByPaths(siteUrl, paths)
}

/** スペース関連のキャッシュをパージ */
export function purgeSpaceCache(spaceId?: string): Promise<PurgeResult> {
  return purgeContentCache('/spaces', spaceId)
}

/** 投稿関連のキャッシュをパージ */
export function purgePostCache(slug?: string): Promise<PurgeResult> {
  return purgeContentCache('/posts', slug)
}

/** ニュース関連のキャッシュをパージ */
export function purgeNewsCache(newsId?: string): Promise<PurgeResult> {
  return purgeContentCache('/news', newsId)
}

/** ページのキャッシュをパージ */
export function purgePageCache(slug: string): Promise<PurgeResult> {
  const siteUrl = getSiteUrl()
  return purgeCloudflareByPaths(siteUrl, [`/${slug}`])
}

/** ホームページのキャッシュをパージ */
export function purgeHomeCache(): Promise<PurgeResult> {
  const siteUrl = getSiteUrl()
  return purgeCloudflareByPaths(siteUrl, ['/'])
}

/** FAQ関連のキャッシュをパージ */
export function purgeFaqCache(): Promise<PurgeResult> {
  const siteUrl = getSiteUrl()
  return purgeCloudflareByPaths(siteUrl, ['/faq'])
}

/** 利用規約関連のキャッシュをパージ */
export function purgeTermsCache(): Promise<PurgeResult> {
  const siteUrl = getSiteUrl()
  return purgeCloudflareByPaths(siteUrl, ['/terms'])
}
