import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { isWithinDeadline } from "./deadline";
import { reservationDeadlineNow } from "./server-deadline-instant";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";

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
  cancellationReason: string | null = null,
): Promise<CommandResult<CancelPayload>> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId, deletedAt: null },
      select: { id: true, status: true, startTime: true, couponId: true },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
      return { success: false, error: "この予約はキャンセルできません" };
    }

    if (
      !isWithinDeadline(
        reservation.startTime,
        deadlineHours,
        reservationDeadlineNow(),
      )
    ) {
      return {
        success: false,
        error: `キャンセル期限（${String(deadlineHours)}時間前）を過ぎています`,
      };
    }

    await tx.reservation.update({
      where: { id: reservationId, deletedAt: null },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByType: CANCELLED_BY.CUSTOMER,
        icsSequence: { increment: 1 },
        ...(cancellationReason ? { cancellationReason } : {}),
      },
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
      where: { id: reservationId, customerId, deletedAt: null },
      select: {
        id: true,
        status: true,
        startTime: true,
        taxRateType: true,
        taxRate: true,
        couponId: true,
        coupon: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            discountValue: true,
            maxDiscountAmount: true,
            canCombineWithDurationDiscount: true,
            validFrom: true,
            validUntil: true,
            usageLimit: true,
            usageCount: true,
          },
        },
      },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
      return { success: false, error: "この予約は変更できません" };
    }

    if (
      !isWithinDeadline(
        reservation.startTime,
        modificationDeadlineHours,
        reservationDeadlineNow(),
      )
    ) {
      return {
        success: false,
        error: `変更期限（${String(modificationDeadlineHours)}時間前）を過ぎています`,
      };
    }

    // スペースの存在確認（割引設定も取得）
    const space = await tx.space.findUnique({
      where: { id: input.spaceId, isActive: true, isPublished: true },
      select: {
        id: true,
        hourlyPrice: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
      },
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

    // 割引設定を取得
    const settings = await tx.settings.findFirst({
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    });

    // 料金の再計算（クーポン・長時間割引含む）
    const hours =
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);

    const spaceDiscount:
      | import("@/shared/lib/pricing/types").SpaceDiscountSettings
      | null =
      space.discountType !== "none" &&
      space.discountValue != null &&
      space.discountValue > 0
        ? {
            discountType: space.discountType,
            discountValue: space.discountValue,
            durationDiscountOverride: space.durationDiscountOverride,
          }
        : null;

    const coupon = reservation.coupon;
    const couponForCalc =
      coupon &&
      coupon.validFrom &&
      coupon.validUntil &&
      new Date(coupon.validFrom) <= startDateTime &&
      new Date(coupon.validUntil) >= endDateTime
        ? {
            id: coupon.id,
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            discountValue: coupon.discountValue,
            maxDiscountAmount: coupon.maxDiscountAmount,
            canCombineWithDurationDiscount:
              coupon.canCombineWithDurationDiscount,
          }
        : null;

    const priceResult = calculateReservationPrice({
      hourlyPrice: space.hourlyPrice,
      hours,
      spaceDiscount,
      durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
      durationRules: parseDurationDiscountRules(
        settings?.durationDiscountRules,
      ),
      coupon: couponForCalc,
      combinationMode: getValidDiscountCombinationMode(
        settings?.discountCombinationMode ?? undefined,
      ),
    });

    const taxRate = reservation.taxRate ? Number(reservation.taxRate) : 0;
    const taxAmount = Math.floor(priceResult.totalPrice * taxRate);

    await tx.reservation.update({
      where: { id: reservationId, deletedAt: null },
      data: {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        basePrice: priceResult.basePrice,
        totalPrice: priceResult.totalPrice,
        spaceDiscountAmount: priceResult.spaceDiscount,
        durationDiscountAmount: priceResult.durationDiscount,
        couponDiscountAmount: priceResult.couponDiscount,
        taxAmount,
        totalPriceWithTax: priceResult.totalPrice + taxAmount,
        couponId: couponForCalc ? reservation.couponId : null,
        icsSequence: { increment: 1 },
      },
    });

    return { success: true, payload: { reservationId } };
  });
}
