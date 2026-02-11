/**
 * Stripe 初期化・ヘルパー関数
 *
 * 環境変数優先、DBフォールバック
 * テストモード自動検出
 * 接続テスト機能
 */

import Stripe from 'stripe'
import { safeDecrypt } from '@/shared/lib/crypto'

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

// キープレフィックス定数
interface KeyPrefixes {
  publishableTest: string
  publishableLive: string
  secretTest: string
  secretLive: string
  webhook: string
}

const KEY_PREFIXES: KeyPrefixes = {
  publishableTest: 'pk_test_',
  publishableLive: 'pk_live_',
  secretTest: 'sk_test_',
  secretLive: 'sk_live_',
  webhook: 'whsec_',
}

/**
 * テストキーかどうかを判定
 */
export function isTestKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretTest) || key.startsWith(KEY_PREFIXES.publishableTest)
}

/**
 * ライブキーかどうかを判定
 */
export function isLiveKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretLive) || key.startsWith(KEY_PREFIXES.publishableLive)
}

/**
 * 公開可能キーの形式が正しいか検証
 */
export function isValidPublishableKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.publishableTest) || key.startsWith(KEY_PREFIXES.publishableLive)
}

/**
 * シークレットキーの形式が正しいか検証
 */
export function isValidSecretKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretTest) || key.startsWith(KEY_PREFIXES.secretLive)
}

/**
 * Webhookシークレットの形式が正しいか検証
 */
export function isValidWebhookSecret(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.webhook)
}

/**
 * シークレットキーをマスク表示用に変換
 * sk_test_xxxxxxxxxxxx → sk_test_xxxx...xxxx
 *
 * セキュリティ: 入力をサニタイズしてXSS攻撃を防止
 */
export function maskSecretKey(key: string): string {
  if (!key || key.length < 16) return '****'

  // Stripeキーは英数字とアンダースコアのみを含む
  // 不正な文字が含まれている場合は安全なフォールバックを返す
  if (!/^[a-zA-Z0-9_]+$/.test(key)) {
    return '****'
  }

  const prefix = key.substring(0, 12) // sk_test_ + 最初の4文字
  const suffix = key.substring(key.length - 4)
  return `${prefix}...${suffix}`
}

/**
 * 環境変数からStripeシークレットキーを取得
 */
function getEnvSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null
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
  // 1. 環境変数を優先
  const envKey = getEnvSecretKey()
  if (envKey) {
    return {
      client: createStripeClient(envKey),
      source: 'env',
    }
  }

  // 2. DBのキーを使用（復号化）
  if (dbSecretKey) {
    const decryptedKey = safeDecrypt(dbSecretKey)
    if (decryptedKey) {
      return {
        client: createStripeClient(decryptedKey),
        source: 'db',
      }
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
    const message =
      error instanceof Error ? error.message : '接続テストに失敗しました'

    // Stripeエラーの場合、より具体的なメッセージを返す
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

    return {
      success: false,
      error: message,
    }
  }
}

/**
 * キーのモード（test/live）がマッチしているか確認
 */
export function keysHaveMatchingMode(
  publishableKey: string,
  secretKey: string
): boolean {
  const publishableIsTest = isTestKey(publishableKey)
  const secretIsTest = isTestKey(secretKey)
  return publishableIsTest === secretIsTest
}

/**
 * 通貨コードの表示名を取得
 */
export function getCurrencyDisplayName(currency: string): string {
  const currencies: Record<string, string> = {
    jpy: '日本円 (JPY)',
    usd: '米ドル (USD)',
    eur: 'ユーロ (EUR)',
  }
  return currencies[currency.toLowerCase()] || currency.toUpperCase()
}

/**
 * サポートされている通貨一覧
 */
export interface CurrencyOption {
  value: SupportedCurrency
  label: string
}

export type SupportedCurrency = 'jpy' | 'usd' | 'eur'

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { value: 'jpy', label: '日本円 (JPY)' },
  { value: 'usd', label: '米ドル (USD)' },
  { value: 'eur', label: 'ユーロ (EUR)' },
]
