/**
 * 予約 / イベント参加申込の claim トークン cookie 名
 *
 * `proxy.ts`（Edge runtime middleware）が `?token=...` を HttpOnly cookie に転写し、
 * `claim/reservation` / `claim/event-registration` 配下の page.tsx・Server Action
 * （Node runtime）がその cookie を読む。`proxy.ts` は `next/server` の Edge 専用型に
 * 依存するため、Node runtime 側のファイルから `proxy.ts` を直接 import すると Edge 専用
 * 型が引き込まれてしまう。この定数ファイルはランタイム依存を一切持たないため、
 * Edge / Node どちらの runtime からも安全に import できる単一の値ソースとして機能する。
 */

export const RESERVATION_CLAIM_TOKEN_COOKIE_NAME = "reservation-claim-token";
export const EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME =
  "event-registration-claim-token";
