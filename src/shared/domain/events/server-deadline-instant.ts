import "server-only";

/**
 * イベント参加申込のキャンセルトークン検証に使う「現在時刻」。
 * ドメインコマンドと Server Component のみで使用する（クライアントでは呼ばない）。
 * `reservations/server-deadline-instant.ts` と同型（React Compiler purity lint の
 * 直接 `new Date()` 呼出し警告を named function 経由で回避する）。
 */
export function eventRegistrationDeadlineNow(): Date {
  return new Date();
}
