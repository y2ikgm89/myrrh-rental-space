/**
 * Cloudflare Turnstile サーバーサイド検証
 */

type TurnstileVerifyResponse = {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
}

/**
 * Turnstileトークンを検証
 * @param token クライアントから受け取ったトークン
 * @returns 検証成功時true、失敗時false
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY

  // シークレットキーが設定されていない場合はスキップ（開発環境用）
  if (!secretKey) {
    console.warn('Turnstile secret key is not configured. Skipping verification.')
    return true
  }

  // トークンが空の場合は失敗
  if (!token) {
    console.warn('Empty Turnstile token provided')
    return false
  }

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: secretKey,
          response: token,
        }),
      }
    )

    if (!response.ok) {
      console.error('Turnstile API returned non-OK status:', response.status)
      return false
    }

    const data: TurnstileVerifyResponse = await response.json()

    if (!data.success) {
      console.warn('Turnstile verification failed:', data['error-codes'])
    }

    return data.success
  } catch (error) {
    console.error('Turnstile verification error:', error)
    return false
  }
}

/**
 * Turnstileが有効かどうかをチェック
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
}
