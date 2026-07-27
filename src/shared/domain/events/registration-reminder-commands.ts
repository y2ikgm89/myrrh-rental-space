import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * イベント参加者リマインダー送信の atomic claim。
 *
 * Reservation.reminderSentAt と同型のパターン: Cloud Scheduler の at-least-once
 * 配信による二重起動を、`updateMany({ where: { reminderSentAt: null } })` の
 * WHERE 条件自体で claim することで防ぐ（PostgreSQL の単一 UPDATE は atomic）。
 * `status: CONFIRMED` も条件に含め、cron 実行中にキャンセルされた申込への
 * 誤 claim を防ぐ。
 *
 * @returns claim 成功時のみ `true`。
 */
export async function claimEventRegistrationReminder(
  registrationId: string,
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      reminderSentAt: null,
    },
    data: { reminderSentAt: new Date() },
  });
  return result.count > 0;
}

/**
 * リマインダー送信失敗時に {@link claimEventRegistrationReminder} の claim を解放する
 * （`reminderSentAt` を null に戻す）。次回 cron 実行で再送対象に戻す。
 */
export async function releaseEventRegistrationReminderClaim(
  registrationId: string,
): Promise<void> {
  await prisma.eventRegistration.updateMany({
    where: { id: registrationId },
    data: { reminderSentAt: null },
  });
}
