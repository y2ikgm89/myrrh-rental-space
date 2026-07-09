/**
 * Settings テーブルに保存する暗号化フィールドの HKDF purpose 文字列（単一ソース）。
 *
 * 各統合が専用の派生鍵を持つよう、統合ごとに一意な文字列を割り当てる。
 * `crypto.ts` の `decrypt()` は暗号文自身に埋め込まれた purpose で鍵導出するため、
 * ここでの値変更は既存の暗号化済みデータの復号に影響しない（次回保存時から新値が使われる）。
 *
 * 新しい統合を追加する際は必ずここに追加し、既存の値と重複しないこと
 * （重複チェックは `__tests__/unit/architecture/crypto-purpose-registry.test.ts`）。
 * 呼び出し元でのインライン文字列直書きは禁止（コピペによる衝突を防ぐため）。
 */
export const SETTINGS_CRYPTO_PURPOSES = {
  stripeSecretKey: "stripe-secret-key",
  stripeWebhookSecret: "stripe-webhook-secret",
  turnstileSecretKey: "turnstile-secret-key",
  googleMapsApiKey: "google-maps-api-key",
  resendApiKey: "resend-api-key",
  customApiKey: "custom-api-key",
  googleCalendarServiceAccount: "google-calendar-service-account",
  googleBusinessProfileAuth: "google-business-profile-auth",
} as const;
