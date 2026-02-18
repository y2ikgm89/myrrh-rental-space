/**
 * Google OAuth 資格情報リーダー
 *
 * DB優先、環境変数フォールバックでGoogle OAuth認証情報を取得。
 * auth.ts と google-calendar.ts の共通データソース。
 *
 * @module shared/lib/google-oauth-credentials
 */

import 'server-only'
import { prisma } from './prisma'
import { safeDecrypt } from './crypto'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from './errors'
import { serverEnv } from '@/shared/lib/env/server'

export interface GoogleOAuthCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Google OAuth 資格情報を取得（DB優先、環境変数フォールバック）
 *
 * - DB に保存されている場合: 復号して返す
 * - DB にない場合: 環境変数から取得
 * - ビルド時（DB不可）: try-catch で環境変数にフォールバック
 */
export async function getGoogleOAuthCredentials(): Promise<GoogleOAuthCredentials | null> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        googleOAuthClientId: true,
        googleOAuthClientSecret: true,
      },
    })

    if (settings?.googleOAuthClientId && settings?.googleOAuthClientSecret) {
      const clientSecret = safeDecrypt(settings.googleOAuthClientSecret)
      if (clientSecret) {
        return {
          clientId: settings.googleOAuthClientId,
          clientSecret,
        }
      }
    }
  } catch (error) {
    // ビルド時やDB不可の場合は環境変数にフォールバック
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getGoogleOAuthCredentials', note: 'falling back to env vars' },
    })
  }

  // 環境変数フォールバック
  const clientId = serverEnv.GOOGLE_CLIENT_ID
  const clientSecret = serverEnv.GOOGLE_CLIENT_SECRET

  if (clientId && clientSecret) {
    return { clientId, clientSecret }
  }

  return null
}
