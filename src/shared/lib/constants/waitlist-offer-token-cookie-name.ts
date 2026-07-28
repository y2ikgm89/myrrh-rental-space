/**
 * 繰り上げ当選（waitlist offer）有料チケット Checkout 起動用トークン cookie 名。
 *
 * `proxy.ts`（Node.js runtime proxy）が `?token=...` を HttpOnly cookie に転写し、
 * `/events/waitlist/checkout` Route Handler（Node runtime）がその cookie
 * を読む。`proxy.ts` は Edge 専用型に依存するため、Node 側から直接 import
 * すると型が引き込まれる。この定数ファイルはランタイム依存を持たない単一の
 * 値ソース。
 */

export const WAITLIST_OFFER_TOKEN_COOKIE_NAME = "waitlist-offer-token";
