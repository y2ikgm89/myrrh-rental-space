import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";

/**
 * 当日受付 (check-in) の出席フラグを toggle する。
 *
 * - `attended: true`  → attendedAt を現在時刻にセット (既に出席済なら no-op で既存値を返す)
 * - `attended: false` → attendedAt を null に戻す (誤打刻取消)
 *
 * 二重押し / 多端末からの並列実行は last-write-wins。check-in には capacity 制約が
 * 無いため advisory lock は不要。CANCELLED 済の申込には適用できない。
 *
 * TOCTOU 防御: findFirst と update の間で顧客セルフキャンセル等が別 tx で
 * CANCELLED へ遷移させた場合でも、update ではなく updateMany + WHERE
 * `status: { not: CANCELLED }` で claim することで DB 層でも invariant を維持する。
 * count=0 はレース経路で CANCELLED になったケースで、通常の VALIDATION として throw する。
 */
export async function setEventRegistrationCheckInCommand(params: {
  eventId: string;
  registrationId: string;
  attended: boolean;
}) {
  const existing = await prisma.eventRegistration.findFirst({
    where: {
      id: params.registrationId,
      eventId: params.eventId,
      event: { deletedAt: null },
    },
    select: {
      id: true,
      eventId: true,
      attendedAt: true,
      status: true,
    },
  });
  if (!existing) throw new DomainError("申込が見つかりません", "NOT_FOUND");
  // チェックイン / 解除は CONFIRMED のみ。WAITLISTED / OFFERED / EXPIRED /
  // CANCELLED 等は出席対象外（clean-break）。
  if (existing.status !== RegistrationStatus.CONFIRMED) {
    throw new DomainError("確定済みの申込のみ出席登録できます", "VALIDATION");
  }

  const nextAttendedAt = params.attended ? new Date() : null;

  // 状態変化なしは no-op (DB 書き込み回避、監査ログ汚染防止)
  if (
    (existing.attendedAt === null && nextAttendedAt === null) ||
    (existing.attendedAt !== null && nextAttendedAt !== null)
  ) {
    return {
      registrationId: existing.id,
      eventId: existing.eventId,
      before: existing.attendedAt,
      after: existing.attendedAt,
      changed: false,
    };
  }

  // findFirst と update の間に別 tx が CONFIRMED 以外へ遷移させた TOCTOU を防ぐため、
  // update ではなく updateMany + status guard で claim する。
  const claim = await prisma.eventRegistration.updateMany({
    where: {
      id: existing.id,
      status: RegistrationStatus.CONFIRMED,
    },
    data: { attendedAt: nextAttendedAt },
  });

  if (claim.count === 0) {
    throw new DomainError("確定済みの申込のみ出席登録できます", "VALIDATION");
  }

  return {
    registrationId: existing.id,
    eventId: existing.eventId,
    before: existing.attendedAt,
    after: nextAttendedAt,
    changed: true,
  };
}
