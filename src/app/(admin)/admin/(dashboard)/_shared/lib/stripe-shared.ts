/**
 * Stripe クライアントセーフ共有コード
 *
 * server-only を含まない。
 * Client Component / Server Component / Server Action のいずれからも import 可能。
 * シークレット情報・API 呼び出しを一切含まない。
 */

// =============================================================================
// 通貨
// =============================================================================

/** Zod enum / DB フィールド用の値配列 */
export const SUPPORTED_CURRENCY_VALUES = ['jpy', 'usd', 'eur'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCY_VALUES)[number]

export interface CurrencyOption {
  value: SupportedCurrency
  label: string
}

/** UI 表示用（value + label ペア） */
export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { value: 'jpy', label: '日本円 (JPY)' },
  { value: 'usd', label: '米ドル (USD)' },
  { value: 'eur', label: 'ユーロ (EUR)' },
]

// =============================================================================
// キープレフィックス（秘密情報なし）
// =============================================================================

const KEY_PREFIXES = {
  publishableTest: 'pk_test_',
  publishableLive: 'pk_live_',
  secretTest: 'sk_test_',
  secretLive: 'sk_live_',
  webhook: 'whsec_',
} as const

// =============================================================================
// キー形式検証（純粋関数 — API 呼び出しなし）
// =============================================================================

/** テストキー（公開可能 or シークレット）かを判定 */
export function isTestKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretTest) || key.startsWith(KEY_PREFIXES.publishableTest)
}

/** ライブキー（公開可能 or シークレット）かを判定 */
export function isLiveKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretLive) || key.startsWith(KEY_PREFIXES.publishableLive)
}

/** 公開可能キーの形式が正しいか検証 */
export function isValidPublishableKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.publishableTest) || key.startsWith(KEY_PREFIXES.publishableLive)
}

/** シークレットキーの形式が正しいか検証 */
export function isValidSecretKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretTest) || key.startsWith(KEY_PREFIXES.secretLive)
}

/** Webhookシークレットの形式が正しいか検証 */
export function isValidWebhookSecret(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.webhook)
}

/** キーのモード（test/live）がマッチしているか確認 */
export function keysHaveMatchingMode(publishableKey: string, secretKey: string): boolean {
  return isTestKey(publishableKey) === isTestKey(secretKey)
}

/**
 * シークレットキーをマスク表示用に変換
 * sk_test_xxxxxxxxxxxx → sk_test_xxxx...xxxx
 *
 * セキュリティ: 入力をサニタイズして XSS 攻撃を防止
 */
export function maskSecretKey(key: string): string {
  if (!key || key.length < 16) return '****'
  if (!/^[a-zA-Z0-9_]+$/.test(key)) return '****'
  const prefix = key.substring(0, 12)
  const suffix = key.substring(key.length - 4)
  return `${prefix}...${suffix}`
}
