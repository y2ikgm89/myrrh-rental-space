import "server-only";

import { createHash } from "node:crypto";

/**
 * トークンの SHA-256 指紋を返す (先頭 16 文字)。
 *
 * ステートレストークン (キャンセル / 申込キャンセル / .ics カレンダー等) の
 * 平文を監査ログ / WARNING ログに残さないための SSoT helper。
 * 同一トークンの繰り返し試行と、異なるトークンの試行を識別できる粒度。
 *
 * `reservation-cancel-token.ts` / `event-registration-cancel-token.ts` 等で
 * 完全に同型の実装を書いていた重複を集約 (DUP-1 部分対応)。
 */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
