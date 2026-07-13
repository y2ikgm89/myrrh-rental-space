/**
 * Stripe Checkout Session の `payment_method_types` に渡せる method 名の許容セット。
 *
 * 値は Stripe API v2 が受け付ける公式文字列で、Settings.stripePaymentMethodTypes
 * の Zod バリデーションと `createCheckoutSessionCommand` の pass-through 実装で
 * SSoT として共有する。ハードコードの `["card"]` フォールバックは持たない
 * (Settings が最低 1 件を保証、domain 層で assert)。
 *
 * ## 対応 method
 *
 * - `card` — クレジット / デビットカード。全通貨対応の基本 method
 * - `konbini` — コンビニ決済 (JPY 通貨限定・Stripe Japan)
 * - `customer_balance` — 銀行振込 (Cash Balance) JPY/USD/EUR/GBP 対応
 * - `link` — Stripe Link (1-click checkout。card 相当、link を単独指定不可)
 *
 * ## 通貨との互換性
 *
 * `konbini` は JPY のみ、`customer_balance` の JPY サポートは Stripe Japan 要有効化、
 * `link` は自動 card fallback を持つが `card` と同時指定推奨。組み合わせによっては
 * Checkout Session 作成時に Stripe API がエラーを返すので、管理 UI は
 * `SUPPORTED_BY_CURRENCY[currency]` で運用者側の選択肢を絞る。
 *
 * @see https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-payment_method_types
 * @see https://docs.stripe.com/payments/payment-methods/overview
 */

export const STRIPE_PAYMENT_METHOD_TYPE_VALUES = [
  "card",
  "konbini",
  "customer_balance",
  "link",
] as const;

export type StripePaymentMethodType =
  (typeof STRIPE_PAYMENT_METHOD_TYPE_VALUES)[number];

export const STRIPE_PAYMENT_METHOD_LABELS: Record<
  StripePaymentMethodType,
  string
> = {
  card: "クレジット / デビットカード",
  konbini: "コンビニ決済 (JPY のみ)",
  customer_balance: "銀行振込 / Cash Balance",
  link: "Stripe Link (ワンクリック決済)",
};

/**
 * 各 method が対応する Stripe 通貨コード。undefined = 全通貨で使用可。
 */
export const STRIPE_PAYMENT_METHOD_CURRENCY_ALLOW: Partial<
  Record<StripePaymentMethodType, readonly string[]>
> = {
  konbini: ["jpy"],
  customer_balance: ["jpy", "usd", "eur", "gbp"],
};

const STRIPE_PAYMENT_METHOD_TYPE_SET: ReadonlySet<string> = new Set(
  STRIPE_PAYMENT_METHOD_TYPE_VALUES,
);

export function isStripePaymentMethodType(
  value: unknown,
): value is StripePaymentMethodType {
  return typeof value === "string" && STRIPE_PAYMENT_METHOD_TYPE_SET.has(value);
}

/**
 * 指定 method が指定 currency 下で使用可能かを判定する。
 *
 * `STRIPE_PAYMENT_METHOD_CURRENCY_ALLOW` に登録が無い method は全通貨対応
 * (undefined = 制約なし)、登録がある method は allow list に含まれる場合のみ true。
 * `card` 等の全通貨対応 method は常に true。
 */
export function isPaymentMethodAllowedForCurrency(
  method: StripePaymentMethodType,
  currency: string,
): boolean {
  const allowed = STRIPE_PAYMENT_METHOD_CURRENCY_ALLOW[method];
  if (allowed === undefined) return true;
  return allowed.includes(currency.toLowerCase());
}

/**
 * 指定 currency と互換な method のみ残して返す。空配列になるケースは
 * caller 側 (UI / Zod / domain layer) で「最低 1 件」契約を守る責務。
 */
export function filterCompatiblePaymentMethods(
  methods: ReadonlyArray<StripePaymentMethodType>,
  currency: string,
): StripePaymentMethodType[] {
  return methods.filter((m) => isPaymentMethodAllowedForCurrency(m, currency));
}
