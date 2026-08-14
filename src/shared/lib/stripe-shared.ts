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
export const SUPPORTED_CURRENCY_VALUES = ["jpy", "usd", "eur"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCY_VALUES)[number];

export interface CurrencyOption {
  value: SupportedCurrency;
  label: string;
}

/** UI 表示用（value + label ペア） */
export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { value: "jpy", label: "日本円 (JPY)" },
  { value: "usd", label: "米ドル (USD)" },
  { value: "eur", label: "ユーロ (EUR)" },
];

// =============================================================================
// unit_amount 変換 (Stripe 最小単位 ↔ アプリ単位)
// =============================================================================

/**
 * Stripe が最小単位を保持しない (= 表示単位 = 最小単位) 通貨集合。
 *
 * 例: JPY 5000 は Stripe 側でも `unit_amount: 5000` (¥5,000)。
 *     USD 50 は Stripe 側で `unit_amount: 5000` (5000 cents = $50)。
 *
 * Stripe API 公式リストからの subset (アプリでサポートし得る主要通貨)。
 * 未知の通貨は「小数点あり (100 倍)」として扱う (default 挙動)。
 * Ref: https://docs.stripe.com/currencies#zero-decimal
 */
export const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "isk",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

/**
 * アプリ単位金額 → Stripe unit_amount 変換
 *
 * JPY 等のゼロ小数点通貨はそのまま。それ以外は 100 倍 (dollars → cents)。
 * currency は case-insensitive で判定する。
 */
export function toStripeUnitAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amount
    : Math.round(amount * 100);
}

/**
 * Stripe unit_amount → アプリ単位金額 変換 (`toStripeUnitAmount` の逆関数)
 *
 * webhook 経由で受け取る `charge.amount` / `refund.amount` は常に Stripe 最小単位。
 * 表示・メール・UI はこの関数で通貨に応じた逆変換をする。
 *
 * Stripe は整数の最小単位しか送らないが、非ゼロ小数点通貨では `/100` の結果が
 * 整数にならないことがある（例: Dashboard で $12.50 を返すと 1250 cents → 12.5）。
 * `Refund.amount` は Int なので、永続化には `toPersistedAppAmount` を使う。
 */
export function fromStripeUnitAmount(
  unitAmount: number,
  currency: string,
): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? unitAmount
    : unitAmount / 100;
}

/**
 * Stripe 最小単位を `Refund.amount` (Int) に書けるアプリ単位へ変換する。
 * 結果が整数でなければ丸めず、typed error を投げる。
 */
export function toPersistedAppAmount(
  stripeMinor: number,
  currency: string,
): number {
  const appAmount = fromStripeUnitAmount(stripeMinor, currency);
  if (!Number.isInteger(appAmount)) {
    throw new NonIntegerAppAmountError(stripeMinor, currency, appAmount);
  }
  return appAmount;
}

export class NonIntegerAppAmountError extends Error {
  readonly code = "NON_INTEGER_APP_AMOUNT" as const;
  readonly stripeMinor: number;
  readonly currency: string;
  readonly appAmount: number;

  constructor(stripeMinor: number, currency: string, appAmount: number) {
    super(
      `Refund amount ${appAmount} (${currency}) is not an integer app unit; cannot persist to Refund.amount`,
    );
    this.name = "NonIntegerAppAmountError";
    this.stripeMinor = stripeMinor;
    this.currency = currency;
    this.appAmount = appAmount;
  }
}

export function isNonIntegerAppAmountError(
  error: unknown,
): error is NonIntegerAppAmountError {
  return error instanceof NonIntegerAppAmountError;
}

// =============================================================================
// キープレフィックス（秘密情報なし）
// =============================================================================

const KEY_PREFIXES = {
  publishableTest: "pk_test_",
  publishableLive: "pk_live_",
  secretTest: "sk_test_",
  secretLive: "sk_live_",
  webhook: "whsec_",
} as const;

// =============================================================================
// キー形式検証（純粋関数 — API 呼び出しなし）
// =============================================================================

/** テストキー（公開可能 or シークレット）かを判定 */
export function isTestKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.secretTest) ||
    key.startsWith(KEY_PREFIXES.publishableTest)
  );
}

/** ライブキー（公開可能 or シークレット）かを判定 */
export function isLiveKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.secretLive) ||
    key.startsWith(KEY_PREFIXES.publishableLive)
  );
}

/** 公開可能キーの形式が正しいか検証 */
export function isValidPublishableKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.publishableTest) ||
    key.startsWith(KEY_PREFIXES.publishableLive)
  );
}

/** シークレットキーの形式が正しいか検証 */
export function isValidSecretKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.secretTest) ||
    key.startsWith(KEY_PREFIXES.secretLive)
  );
}

/** Webhookシークレットの形式が正しいか検証 */
export function isValidWebhookSecret(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.webhook);
}

/** キーのモード（test/live）がマッチしているか確認 */
export function keysHaveMatchingMode(
  publishableKey: string,
  secretKey: string,
): boolean {
  return isTestKey(publishableKey) === isTestKey(secretKey);
}

/**
 * シークレットキーをマスク表示用に変換
 * sk_test_xxxxxxxxxxxx → sk_test_xxxx...xxxx
 *
 * セキュリティ: 入力をサニタイズして XSS 攻撃を防止
 */
export function maskSecretKey(key: string): string {
  if (!key || key.length < 16) return "****";
  if (!/^[a-zA-Z0-9_]+$/.test(key)) return "****";
  const prefix = key.substring(0, 12);
  const suffix = key.substring(key.length - 4);
  return `${prefix}...${suffix}`;
}
