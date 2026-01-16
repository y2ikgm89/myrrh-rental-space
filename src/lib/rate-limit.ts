/**
 * レートリミットライブラリ
 *
 * ログイン試行のレートリミット（5回/15分）
 * - DBベース（LoginAttemptテーブル使用）
 * - 成功時にリセット
 * - 自動クリーンアップ機能
 */

import { prisma } from './prisma'
import { logLoginFailed, logLoginSuccess } from './audit'

// =============================================================================
// Types
// =============================================================================

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: Date
}

// =============================================================================
// Constants
// =============================================================================

/** 許可する最大試行回数 */
const MAX_ATTEMPTS = 5

/** リセットまでの時間（ミリ秒）: 15分 */
const WINDOW_MS = 15 * 60 * 1000

// =============================================================================
// Rate Limit Functions
// =============================================================================

/**
 * ログイン試行のレートリミットをチェック
 *
 * @param identifier メールアドレスまたはIPアドレス
 * @returns レートリミット結果
 */
export async function checkLoginRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_MS)

  // 現在のウィンドウ内の試行回数を取得
  const attempts = await prisma.loginAttempt.count({
    where: {
      identifier,
      createdAt: { gte: windowStart },
    },
  })

  const remaining = Math.max(0, MAX_ATTEMPTS - attempts)
  const resetAt = new Date(Date.now() + WINDOW_MS)

  return {
    allowed: attempts < MAX_ATTEMPTS,
    remaining,
    resetAt,
  }
}

/**
 * ログイン失敗を記録
 *
 * @param identifier メールアドレスまたはIPアドレス（ハッシュ）
 * @param email 試行されたメールアドレス
 */
export async function recordLoginFailure(
  identifier: string,
  email: string
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      identifier,
      email,
      success: false,
    },
  })

  // 監査ログに記録
  void logLoginFailed(email, 'Invalid credentials')
}

/**
 * ログイン成功を記録（試行履歴をクリア）
 *
 * @param identifier メールアドレスまたはIPアドレス（ハッシュ）
 * @param userId ユーザーID
 * @param email メールアドレス
 */
export async function recordLoginSuccess(
  identifier: string,
  userId: string,
  email: string
): Promise<void> {
  // 成功時は該当identifierの失敗履歴を削除
  await prisma.loginAttempt.deleteMany({
    where: { identifier },
  })

  // 監査ログに記録
  void logLoginSuccess(userId, email)
}

/**
 * 古いログイン試行履歴をクリーンアップ
 *
 * 定期的に実行することを推奨（cron等）
 */
export async function cleanupOldLoginAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - WINDOW_MS * 2) // 2倍のウィンドウ分を保持

  const result = await prisma.loginAttempt.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  })

  return result.count
}

// =============================================================================
// Middleware Helper
// =============================================================================

/**
 * ログインレートリミットのミドルウェアヘルパー
 *
 * @param identifier 識別子（メールアドレス等）
 * @returns レートリミットエラーメッセージ（制限中の場合）またはnull
 */
export async function checkLoginRateLimitOrFail(
  identifier: string
): Promise<string | null> {
  const result = await checkLoginRateLimit(identifier)

  if (!result.allowed) {
    const resetMinutes = Math.ceil(
      (result.resetAt.getTime() - Date.now()) / 60000
    )
    return `ログイン試行回数が上限に達しました。${resetMinutes}分後に再試行してください。`
  }

  return null
}
