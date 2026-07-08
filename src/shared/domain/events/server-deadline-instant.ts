import "server-only";

/**
 * イベント申込の締切／トークン期限判定の「現在時刻」。
 * ドメインコマンドと Server Component のみで使用する（クライアントでは呼ばない）。
 *
 * `reservations/server-deadline-instant.ts` の `reservationDeadlineNow` と同型
 * （React Compiler の `@eslint-react/purity` 対策として、render 中の `new Date()`
 * 直呼びを一箇所に隔離する）。
 */
export function eventDeadlineNow(): Date {
  return new Date();
}
