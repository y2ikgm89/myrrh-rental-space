/**
 * カレンダー (.ics) ダウンロード用トークン cookie 名
 *
 * `proxy.ts`（Node.js runtime proxy）がメールリンクの `?token=...` を HttpOnly cookie に転写し、
 * `/api/calendar/reservation/*` / `/api/calendar/event/*` の Route Handler（Node runtime）
 * がその cookie を読む。`proxy.ts` は Edge 専用型に依存するため、Node 側から直接
 * import すると型が引き込まれる。この定数ファイルはランタイム依存を持たない単一の
 * 値ソース。
 *
 * cookie 名を reservation / event で分けることで、一方の DL 滞在中にもう一方の
 * トークンが誤って読まれる（cross-contamination）ことを防ぐ。
 * purpose 文字列 `calendar-download-reservation` / `calendar-download-event` とは別物。
 *
 * path 定数は proxy の Set-Cookie と Route Handler の delete で共有する。
 * ずらすと mismatch / expiry 時に cookie が残り、ロックが解けない。
 */

export const CALENDAR_RESERVATION_TOKEN_COOKIE_NAME =
  "calendar-reservation-token";

export const CALENDAR_RESERVATION_TOKEN_COOKIE_PATH =
  "/api/calendar/reservation";

export const CALENDAR_EVENT_TOKEN_COOKIE_NAME = "calendar-event-token";

export const CALENDAR_EVENT_TOKEN_COOKIE_PATH = "/api/calendar/event";
