/**
 * ゲストイベント参加申込ステータスページ用トークン cookie 名
 *
 * `proxy.ts`（Node.js runtime proxy）が `?token=...` を HttpOnly cookie に転写し、
 * `/events/registrations/status` 配下の page（Node runtime）がその cookie を読む。
 * `proxy.ts` は Edge 専用型に依存するため、Node 側から直接 import すると型が
 * 引き込まれる。この定数ファイルはランタイム依存を持たない単一の値ソース。
 *
 * cookie 値の名前は cancel（`event-cancel-token`）と同型の短い識別子。
 * purpose 文字列 `event-registration-status` とは別物。
 */

export const EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME = "event-status-token";
