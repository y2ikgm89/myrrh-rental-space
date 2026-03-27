import "server-only";

/**
 * 予約のキャンセル／変更期限の「現在時刻」。
 * ドメインコマンドと Server Component のみで使用する（クライアントでは呼ばない）。
 */
export function reservationDeadlineNow(): Date {
  return new Date();
}
