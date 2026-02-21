/**
 * Cloudflare Turnstile サーバーサイド検証
 *
 * ボット対策としてCloudflare Turnstileを使用したトークン検証を行います。
 * フォーム送信時のスパム防止に使用します。
 *
 * ## キー取得元
 * - Site Key: DBから取得（管理画面で設定）
 * - Secret Key: DBから取得（管理画面で設定）
 *
 * ## 開発環境
 * シークレットキーが設定されていない場合は検証をスキップします。
 *
 * @module shared/lib/turnstile
 */

import 'server-only'
import { prisma } from './prisma'
import { decrypt, isEncrypted } from './crypto'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from './errors/server'

type TurnstileVerifyResponse = {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
}

/**
 * DBからTurnstile Secret Keyを取得
 */
async function getTurnstileSecretKey(): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { turnstileSecretKey: true },
  })

  if (!settings?.turnstileSecretKey) {
    return null
  }

  // 暗号化フォーマットの検証
  if (!isEncrypted(settings.turnstileSecretKey)) {
    logError(new Error('Invalid encrypted format for Turnstile secret key'), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'getTurnstileSecretKey' },
    })
    return null
  }

  // 復号化（失敗時はnullを返す）
  try {
    return decrypt(settings.turnstileSecretKey)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'getTurnstileSecretKey' },
    })
    return null
  }
}

/**
 * Turnstileトークンを検証
 * @param token クライアントから受け取ったトークン
 * @returns 検証成功時true、失敗時false
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secretKey = await getTurnstileSecretKey()

  // シークレットキーが設定されていない場合はスキップ（開発環境用）
  if (!secretKey) {
    return true
  }

  // トークンが空の場合は失敗
  if (!token) {
    logError(new Error('Empty Turnstile token provided'), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      context: { operation: 'verifyTurnstileToken' },
    })
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
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!response.ok) {
      logError(new Error(`Turnstile API returned non-OK status: ${response.status}`), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'verifyTurnstileToken', status: response.status },
      })
      return false
    }

    const data: TurnstileVerifyResponse = await response.json()

    if (!data.success) {
      logError(new Error('Turnstile verification failed'), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: { operation: 'verifyTurnstileToken', errorCodes: data['error-codes'] },
      })
    }

    return data.success
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'verifyTurnstileToken' },
    })
    return false
  }
}

/**
 * Turnstileが有効かどうかをチェック（DBベース）
 */
export async function isTurnstileEnabled(): Promise<boolean> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      turnstileSiteKey: true,
      turnstileSecretKey: true,
    },
  })

  return Boolean(settings?.turnstileSiteKey && settings?.turnstileSecretKey)
}
