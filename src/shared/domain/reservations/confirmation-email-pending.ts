/**
 * 顧客向け予約確認メールの「送信待ち」マーカーの操作。
 *
 * ## なぜ列が要るか
 *
 * 確認メールは `applyConfirmationSideEffects` が SwitchBot パスコードの確定を
 * **最大 150 秒**待ってから送る（`DEVICE_LIST_POLL_OFFSETS_MS`）。パスコードを
 * メール本文に載せるための設計で、fire-and-forget だから許されていた。
 *
 * ところが Cloud Run の SIGTERM 猶予は **10 秒**しかない。Next.js standalone は
 * `after()` の保留分を drain してから exit する（`next-server.js` の
 * `createInternalWaitUntil` が `onServerClose` に `awaiter.awaiting()` を登録し、
 * `start-server.js` の SIGTERM handler がそれを await する）が、10 秒で足りなければ
 * SIGKILL で打ち切られる。**150 秒の poll はまず間に合わない。**
 *
 * パスコード自体は SwitchBot webhook と `smart-lock-cleanup` cron が回復する。
 * 回復手段が無いのは**メールだけ**で、失うと顧客はスペースに入れない。
 *
 * そこで `Reservation.confirmationEmailPendingAt` に送信意思を残す。
 * `smartLockReissuePendingAt` と同型の pending マーカー。
 *
 * - 予約作成時（送る意思があるとき）に `now()` を立てる
 * - 送信できた／送らないと確定したときに `null` に戻す
 * - 残っている行は cron が回収する
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * 送信待ちマーカーを下ろす。
 *
 * 「送れた」ときだけでなく「送らないと確定した」とき（機能 OFF /
 * `sendCustomerEmail: false`）にも呼ぶ。残したままにすると cron が
 * 送るべきでないメールを送る。
 *
 * 送信の失敗では**呼ばない**。マーカーを残すことが再試行の唯一の手段になる。
 */
export async function clearConfirmationEmailPending(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: reservationId, confirmationEmailPendingAt: { not: null } },
    data: { confirmationEmailPendingAt: null },
  });
}
