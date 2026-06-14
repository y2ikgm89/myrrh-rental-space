import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * 予約リマインダー送信の atomic claim。
 *
 * Cloud Scheduler は at-least-once 配信で、ジョブのリトライや手動再実行により
 * 同一 cron が二重起動しうる。`findMany → 送信 → update` の素朴な流れでは、
 * 並行する 2 実行が同じ `reminderSentAt: null` の予約を読み取り双方が送信する
 * race window が残るため、`updateMany({ where: { reminderSentAt: null } })` の
 * **WHERE 条件**自体で claim する（PostgreSQL の単一 UPDATE は atomic）。
 *
 * 送信前に claim を取得し、成功時のみメールを送る。送信失敗時は
 * {@link releaseReservationReminderClaim} で解放し、次回再送できるようにする。
 *
 * @returns claim 成功時のみ `true`。既に送信済み（並行実行が先に claim / 前回送信済み）
 *   または予約が存在しない場合は `false` を返し、呼び出し元は送信を skip する。
 */
export async function claimReservationReminder(
  reservationId: string,
): Promise<boolean> {
  const result = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      reminderSentAt: null,
    },
    data: { reminderSentAt: new Date() },
  });
  return result.count > 0;
}

/**
 * リマインダー送信失敗時に {@link claimReservationReminder} の claim を解放する
 * （`reminderSentAt` を null に戻す）。次回 cron 実行で再送対象に戻す。
 *
 * 予約が claim 後に削除された場合も throw しないよう `updateMany` を用いる。
 */
export async function releaseReservationReminderClaim(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: reservationId },
    data: { reminderSentAt: null },
  });
}
