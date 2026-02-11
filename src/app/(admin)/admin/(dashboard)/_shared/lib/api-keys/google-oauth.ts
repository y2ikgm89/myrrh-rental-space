/**
 * Google OAuth Key Management
 *
 * Google OAuth接続テストとマスク表示
 */

import type { ApiKeyTestResult } from '@/admin/types/api-keys'
import { maskApiKey } from './helpers'

/**
 * Google OAuth Client Secretのマスク表示
 *
 * GOCSPX- プレフィックスを表示し、残りを隠す
 */
export function maskGoogleOAuthSecret(secret: string): string {
  return maskApiKey(secret, 8, 4)
}

/**
 * Google OAuth資格情報の接続テスト
 *
 * Google の oauth2.googleapis.com/token エンドポイントに
 * client_credentials grant を送信して検証。
 *
 * - `unsupported_grant_type` → 有効（Google OAuth は client_credentials を
 *   サポートしないが、client 認証自体は通る）
 * - `invalid_client` → 無効
 */
export async function testGoogleOAuthConnection(
  clientId: string,
  clientSecret: string
): Promise<ApiKeyTestResult> {
  if (!clientId) {
    return {
      success: false,
      error: 'Client IDを入力してください',
    }
  }

  if (!clientSecret) {
    return {
      success: false,
      error: 'Client Secretを入力してください',
    }
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await response.json()

    // client_credentials は Google OAuth では未サポートだが、
    // Client ID/Secret が有効であれば unsupported_grant_type が返る
    if (data.error === 'unsupported_grant_type') {
      return {
        success: true,
        message: 'Google OAuth資格情報が有効です',
      }
    }

    if (data.error === 'invalid_client') {
      return {
        success: false,
        error: 'Client IDまたはClient Secretが無効です',
      }
    }

    // その他のエラー
    return {
      success: false,
      error: data.error_description || data.error || '検証に失敗しました',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        error: '接続がタイムアウトしました',
      }
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : '接続テストに失敗しました',
    }
  }
}
