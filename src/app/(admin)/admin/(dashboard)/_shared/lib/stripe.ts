/**
 * Stripe 初期化・ヘルパー関数
 *
 * 環境変数優先、DBフォールバック
 * テストモード自動検出
 * 接続テスト機能
 *
 * @important server-only — Client Component から import 禁止
 */

import 'server-only'
import Stripe from 'stripe'
import { safeDecrypt } from '@/shared/lib/crypto'
import { serverEnv } from '@/shared/lib/env/server'
import { isValidSecretKey, isTestKey } from './stripe-shared'

/**
 * Stripe設定の取得元
 */
export type StripeConfigSource = 'env' | 'db' | null

/**
 * Stripe接続テスト結果
 */
export interface StripeConnectionTestResult {
  success: boolean
  error?: string
  accountId?: string
  mode?: 'test' | 'live'
  source?: StripeConfigSource
}

/**
 * 環境変数からStripeシークレットキーを取得
 */
function getEnvSecretKey(): string | null {
  return serverEnv.STRIPE_SECRET_KEY ?? null
}

/**
 * Stripeクライアントを作成
 * @param secretKey - シークレットキー（復号化済み）
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
  })
}

/**
 * 環境変数またはDB設定からStripeクライアントを取得
 * @param dbSecretKey - DBから取得した暗号化されたシークレットキー
 * @returns Stripeクライアントと設定元
 */
export async function getStripeClient(
  dbSecretKey?: string | null
): Promise<{ client: Stripe | null; source: StripeConfigSource }> {
  const envKey = getEnvSecretKey()
  if (envKey) {
    return { client: createStripeClient(envKey), source: 'env' }
  }

  if (dbSecretKey) {
    const decryptedKey = safeDecrypt(dbSecretKey)
    if (decryptedKey) {
      return { client: createStripeClient(decryptedKey), source: 'db' }
    }
  }

  return { client: null, source: null }
}

/**
 * Stripe接続テスト
 * @param secretKey - テストするシークレットキー（平文）
 */
export async function testStripeConnection(
  secretKey: string
): Promise<StripeConnectionTestResult> {
  try {
    if (!isValidSecretKey(secretKey)) {
      return {
        success: false,
        error: 'シークレットキーの形式が正しくありません。sk_test_ または sk_live_ で始まる必要があります。',
      }
    }

    const stripe = createStripeClient(secretKey)
    const account = await stripe.accounts.retrieve()

    return {
      success: true,
      accountId: account.id,
      mode: isTestKey(secretKey) ? 'test' : 'live',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '接続テストに失敗しました'

    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return {
        success: false,
        error: 'APIキーが無効です。正しいキーを入力してください。',
      }
    }

    if (error instanceof Stripe.errors.StripePermissionError) {
      return {
        success: false,
        error: 'このAPIキーにはアカウント情報へのアクセス権限がありません。',
      }
    }

    return { success: false, error: message }
  }
}
