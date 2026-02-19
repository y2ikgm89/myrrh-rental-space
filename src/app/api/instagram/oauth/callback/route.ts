/**
 * Instagram OAuth Callback Route
 *
 * Instagram認証フローのコールバックエンドポイント
 * 認証コードをトークンに交換し、設定を保存
 *
 * @module api/instagram/oauth/callback
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { serverEnv } from '@/shared/lib/env/server'
import { prisma } from '@/shared/lib/prisma'
import { encrypt } from '@/shared/lib/crypto'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramUserInfo,
} from '@/shared/lib/instagram'
import { logError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

const STATE_COOKIE_NAME = 'instagram_oauth_state'

/**
 * Instagram OAuth コールバック
 * GET /api/instagram/oauth/callback
 *
 * 1. code, state, error パラメータ取得
 * 2. エラーチェック
 * 3. CSRF検証
 * 4. 短期トークン取得
 * 5. 長期トークンに交換
 * 6. ユーザー情報取得
 * 7. トークン暗号化して保存
 * 8. 設定ページにリダイレクト
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')
  const errorDescription = searchParams.get('error_description')

  // エラーチェック（ユーザーが認証をキャンセルした場合など）
  if (error) {
    const errorMessage =
      errorDescription || errorReason || 'Instagram認証がキャンセルされました'
    return redirectToSettings({ error: errorMessage })
  }

  // 必須パラメータチェック
  if (!code || !state) {
    return redirectToSettings({ error: '認証パラメータが不足しています' })
  }

  // CSRF検証
  const cookieStore = await cookies()
  const savedState = cookieStore.get(STATE_COOKIE_NAME)?.value

  if (!savedState || savedState !== state) {
    logError(new Error('CSRF state mismatch in Instagram OAuth'), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'instagramOAuthCallback', hasState: !!savedState },
    })
    return redirectToSettings({ error: '認証の検証に失敗しました。再度お試しください。' })
  }

  // state cookieを削除
  cookieStore.delete(STATE_COOKIE_NAME)

  // 環境変数チェック
  const clientId = serverEnv.INSTAGRAM_APP_ID
  const clientSecret = serverEnv.INSTAGRAM_APP_SECRET
  const redirectUri = serverEnv.INSTAGRAM_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectToSettings({
      error: 'Instagram APIの設定が不完全です。環境変数を確認してください。',
    })
  }

  try {
    // 短期トークン取得
    const { accessToken: shortLivedToken, userId } = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri
    )

    // 長期トークンに交換
    const { accessToken: longLivedToken, expiresIn } =
      await exchangeForLongLivedToken(shortLivedToken, clientSecret)

    // ユーザー情報取得
    const userInfo = await fetchInstagramUserInfo(longLivedToken)

    // トークン暗号化
    const encryptedToken = encrypt(longLivedToken, { purpose: 'instagram' })

    // 有効期限を計算（秒単位 -> Date）
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // 設定を保存
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: {
        instagramAccessToken: encryptedToken,
        instagramTokenExpiresAt: expiresAt,
        instagramUserId: userId,
        instagramUsername: userInfo.username,
        instagramAccountType: userInfo.accountType,
      },
      create: {
        id: 'singleton',
        instagramAccessToken: encryptedToken,
        instagramTokenExpiresAt: expiresAt,
        instagramUserId: userId,
        instagramUsername: userInfo.username,
        instagramAccountType: userInfo.accountType,
      },
    })

    return redirectToSettings({
      success: `@${userInfo.username} として接続されました`,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'トークンの取得に失敗しました'

    logError(error instanceof Error ? error : new Error(message), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'instagramOAuthCallback' },
    })

    return redirectToSettings({ error: `認証エラー: ${message}` })
  }
}

/**
 * 設定ページにリダイレクト
 */
function redirectToSettings(params: { error?: string; success?: string }) {
  const baseUrl = getBaseUrl()
  const settingsUrl = new URL('/admin/settings/api', baseUrl)
  settingsUrl.searchParams.set('tab', 'instagram')

  if (params.error) {
    settingsUrl.searchParams.set('error', params.error)
  }
  if (params.success) {
    settingsUrl.searchParams.set('success', params.success)
  }

  return NextResponse.redirect(settingsUrl)
}

/**
 * ベースURLを取得
 */
function getBaseUrl(): string {
  if (serverEnv.BETTER_AUTH_URL) {
    return serverEnv.BETTER_AUTH_URL
  }
  // フォールバック
  return serverEnv.VERCEL_URL
    ? `https://${serverEnv.VERCEL_URL}`
    : 'http://localhost:3000'
}
