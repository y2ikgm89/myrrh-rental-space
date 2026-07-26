/**
 * ゲスト予約ステータスページ用トークン cookie 名
 *
 * `proxy.ts`（Edge runtime）が `?token=...` を HttpOnly cookie に転写し、
 * `/reservation/status` 配下の page（Node runtime）がその cookie を読む。
 * `proxy.ts` は Edge 専用型に依存するため、Node 側から直接 import すると型が
 * 引き込まれる。この定数ファイルはランタイム依存を持たない単一の値ソース。
 *
 * cookie 値の名前は complete / cancel（`complete-token` / `cancel-token`）と
 * 同型の短い識別子。purpose 文字列 `reservation-status` とは別物。
 */

export const RESERVATION_STATUS_TOKEN_COOKIE_NAME = "status-token";
