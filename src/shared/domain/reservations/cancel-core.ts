import "server-only";

import type { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@generated/prisma/enums";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { isWithinDeadline } from "./deadline";

/**
 * 予約キャンセルの共通コア
 *
 * 会員（マイページ）とゲスト（メールリンク）の両キャンセル経路が共有する。
 * 本人性の確認（会員=customerId / ゲスト=トークン）は呼び出し側が行い、本関数は
 * 「キャンセル可否の判定 → CANCELLED 化 → クーポン使用回数の戻し」だけを担う。
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** キャンセル・変更を受け付ける予約ステータス */
export const CANCELLABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

export interface CancellableReservation {
  id: string;
  status: ReservationStatus;
  startTime: Date;
  couponId: string | null;
}

export type CancellationResult =
  | { success: true }
  | { success: false; error: string };

export async function applyCancellation(
  tx: Tx,
  reservation: CancellableReservation,
  options: {
    deadlineHours: number;
    now: Date;
    cancellationReason: string | null;
  },
): Promise<CancellationResult> {
  if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
    return { success: false, error: "この予約はキャンセルできません" };
  }

  if (
    !isWithinDeadline(reservation.startTime, options.deadlineHours, options.now)
  ) {
    return {
      success: false,
      error: `キャンセル期限（${String(options.deadlineHours)}時間前）を過ぎています`,
    };
  }

  await tx.reservation.update({
    where: { id: reservation.id, deletedAt: null },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: options.now,
      cancelledByType: CANCELLED_BY.CUSTOMER,
      icsSequence: { increment: 1 },
      ...(options.cancellationReason
        ? { cancellationReason: options.cancellationReason }
        : {}),
    },
  });

  if (reservation.couponId) {
    await tx.coupon.updateMany({
      where: { id: reservation.couponId, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  }

  return { success: true };
}
