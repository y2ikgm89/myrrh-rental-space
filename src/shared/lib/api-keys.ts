/**
 * API Keys Helpers
 *
 * 共通ユーティリティ関数
 *
 * @module shared/lib/api-keys
 */

/**
 * APIキーをマスク表示用に変換
 * @param key - マスクする文字列
 * @param prefixLength - 表示する先頭文字数（デフォルト: 6）
 * @param suffixLength - 表示する末尾文字数（デフォルト: 4）
 * @returns マスクされた文字列
 */
export function maskApiKey(
  key: string,
  prefixLength = 6,
  suffixLength = 4
): string {
  if (!key) return '****'

  // 不正な文字が含まれている場合は安全なマスクを返す（XSS対策）
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    return '****'
  }

  const minLength = prefixLength + suffixLength + 4
  if (key.length < minLength) {
    return '****'
  }

  const prefix = key.substring(0, prefixLength)
  const suffix = key.substring(key.length - suffixLength)
  return `${prefix}...${suffix}`
}

/**
 * Resend APIキー用のマスク
 */
export function maskResendKey(key: string): string {
  return maskApiKey(key, 6, 4) // re_xxxx...xxxx
}

/**
 * Turnstileキー用のマスク
 */
export function maskTurnstileKey(key: string): string {
  return maskApiKey(key, 6, 4) // 0x1234...abcd
}

/**
 * Google Maps APIキー用のマスク
 */
export function maskGoogleMapsKey(key: string): string {
  return maskApiKey(key, 10, 4) // AIzaSyXXXX...xxxx
}

/**
 * Cloudflare APIトークン用のマスク
 */
export function maskCloudflareToken(token: string): string {
  return maskApiKey(token, 8, 4) // xxxxxxxx...xxxx
}

/**
 * Google OAuth Client Secret用のマスク
 */
export function maskGoogleOAuthSecret(secret: string): string {
  return maskApiKey(secret, 8, 4)
}
