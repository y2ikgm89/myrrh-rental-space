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
 * 回復手段が無いのは**メールだけ**。パスコードの平文はメールに載らず入室ハブで
 * 開示されるが、そのハブへの導線も予約内容の控えも確認メールにしか無いため、
 * 失うと顧客は自分の予約を確認する手段を持たない。
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
 * 送信待ちマーカーを立てる。
 *
 * 公開予約は作成 tx で立てているので、ここに来る時点では既に立っている
 * （`where` の `null` 条件で no-op になる）。**この関数の役目は管理画面経路**で、
 * 管理側の作成・CONFIRMED 遷移・一括確定はいずれも
 * `applyConfirmationSideEffects` を通るため、そこで 1 度呼べば全経路を覆える。
 *
 * **既に立っているマーカーは上書きしない。** 上書きすると猶予窓の起点が
 * 後ろへずれ、回収がその分だけ遅れる。
 */
export async function markConfirmationEmailPending(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: reservationId, confirmationEmailPendingAt: null },
    data: { confirmationEmailPendingAt: new Date() },
  });
}

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
