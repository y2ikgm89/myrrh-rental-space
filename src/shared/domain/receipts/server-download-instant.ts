import "server-only";

/**
 * 領収書 (Receipt) 署名 URL の検証時に使う「現在時刻」。
 *
 * `verifyReceiptDownloadToken(token, now)` の第 2 引数として、Server Component /
 * Route Handler から渡す。関数化する理由は 2 つ:
 *
 * 1. **@eslint-react/purity の警告回避** — Server Component 内で `new Date()` を
 *    直接呼ぶと impure と警告される。ヘルパー関数経由で呼べば警告対象外。
 *    実行時は完全動的化された Server Component (`await connection()`) のため
 *    副作用として問題ない。
 * 2. **将来の時刻凍結余地** — E2E テスト等で時刻を差し替えたくなった場合、
 *    このヘルパーの実装を差し替えるだけで済む (reservationDeadlineNow /
 *    eventDeadlineNow と同型)。
 */
export function receiptDownloadNow(): Date {
  return new Date();
}
