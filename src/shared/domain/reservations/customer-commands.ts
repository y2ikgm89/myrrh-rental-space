import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { isWithinDeadline } from "./deadline";
import { checkReservationOverlap } from "@/shared/lib/reservation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandResult<T> =
  | { success: true; payload: T }
  | { success: false; error: string };

type CancelPayload = { reservationId: string };
type UpdatePayload = { reservationId: string };

const CANCELLABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelCustomerReservation(
  reservationId: string,
  customerId: string,
  deadlineHours: number,
): Promise<CommandResult<CancelPayload>> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId },
      select: { id: true, status: true, startTime: true, couponId: true },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
      return { success: false, error: "この予約はキャンセルできません" };
    }

    if (!isWithinDeadline(reservation.startTime, deadlineHours)) {
      return {
        success: false,
        error: `キャンセル期限（${String(deadlineHours)}時間前）を過ぎています`,
      };
    }

    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED },
    });

    if (reservation.couponId) {
      await tx.coupon.updateMany({
        where: { id: reservation.couponId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }

    return { success: true, payload: { reservationId } };
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCustomerReservation(
  reservationId: string,
  customerId: string,
  input: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
  },
  modificationDeadlineHours: number,
): Promise<CommandResult<UpdatePayload>> {
  const startDateTime = new Date(`${input.date}T${input.startTime}:00`);
  const endDateTime = new Date(`${input.date}T${input.endTime}:00`);

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId },
      select: {
        id: true,
        status: true,
        startTime: true,
        couponDiscountAmount: true,
        durationDiscountAmount: true,
        spaceDiscountAmount: true,
      },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
      return { success: false, error: "この予約は変更できません" };
    }

    if (!isWithinDeadline(reservation.startTime, modificationDeadlineHours)) {
      return {
        success: false,
        error: `変更期限（${String(modificationDeadlineHours)}時間前）を過ぎています`,
      };
    }

    // 手動割引が適用されている場合は顧客による変更を拒否
    const hasManualDiscount =
      (reservation.couponDiscountAmount != null &&
        Number(reservation.couponDiscountAmount) > 0) ||
      (reservation.durationDiscountAmount != null &&
        Number(reservation.durationDiscountAmount) > 0) ||
      (reservation.spaceDiscountAmount != null &&
        Number(reservation.spaceDiscountAmount) > 0);

    if (hasManualDiscount) {
      return {
        success: false,
        error:
          "割引が適用されている予約はオンラインで変更できません。お電話でお問い合わせください。",
      };
    }

    // スペースの存在確認
    const space = await tx.space.findUnique({
      where: { id: input.spaceId, isActive: true, isPublished: true },
      select: { id: true, hourlyPrice: true },
    });

    if (!space) {
      throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
    }

    // 重複チェック
    const overlapResult = await checkReservationOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        excludeReservationId: reservationId,
      },
      tx,
    );

    if (overlapResult.hasOverlap) {
      return {
        success: false,
        error:
          "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      };
    }

    // 基本料金の再計算
    const hours =
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
    const basePrice = Math.floor(space.hourlyPrice * hours);

    // TODO: クーポン・長時間割引の再計算は未実装（将来タスク）
    await tx.reservation.update({
      where: { id: reservationId },
      data: {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        basePrice,
        totalPrice: basePrice,
      },
    });

    return { success: true, payload: { reservationId } };
  });
}
