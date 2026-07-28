/**
 * 有料イベント直接申込の Stripe Checkout 起動用トークン cookie 名。
 *
 * `proxy.ts`（Node.js runtime proxy）が `?token=...` を HttpOnly cookie に転写し、
 * `/events/registrations/checkout` Route Handler（Node runtime）がその cookie
 * を読む。`proxy.ts` は Edge 専用型に依存するため、Node 側から直接 import
 * すると型が引き込まれる。この定数ファイルはランタイム依存を持たない単一の
 * 値ソース。
 */

export const EVENT_REGISTRATION_PAYMENT_TOKEN_COOKIE_NAME =
  "event-registration-payment-token";
