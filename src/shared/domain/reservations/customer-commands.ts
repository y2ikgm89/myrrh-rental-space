import "server-only";
import { calculateDurationHours } from "@/shared/lib/date-format";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isWithinDeadline } from "./deadline";
import { reservationDeadlineNow } from "./server-deadline-instant";
import { applyCancellation, CANCELLABLE_STATUSES } from "./cancel-core";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import { checkReservationDuration } from "@/shared/lib/reservation/time-slots-utils";
import { getReservationRuleSettings } from "@/shared/domain/reservations/availability";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
import { lockReservationSpaceForTransaction } from "./locks";
import { buildDateTime } from "./payloads";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandResult<T> =
  { success: true; payload: T } | { success: false; error: string };

type CancelPayload = { reservationId: string };
type UpdatePayload = { reservationId: string };

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

    const result = await applyCancellation(tx, reservation, {
      deadlineHours,
      now: reservationDeadlineNow(),
      cancellationReason,
      cancelledByType: CANCELLED_BY.CUSTOMER_MYPAGE,
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, payload: { reservationId } };
  });
}

/**
 * トークン経由の予約キャンセル（ゲスト用）
 *
 * 確認メールのキャンセルリンクから呼ばれる。本人性は検証済みトークンが担保するため、
 * customerId による所有権フィルタは行わず reservationId だけで予約を特定する。
 * 状態・期限の判定とクーポン戻しは会員経路と同じ {@link applyCancellation} を共有する。
 */
export async function cancelReservationByToken(
  reservationId: string,
  deadlineHours: number,
  cancellationReason: string | null = null,
): Promise<CommandResult<CancelPayload>> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, deletedAt: null },
      select: { id: true, status: true, startTime: true, couponId: true },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    const result = await applyCancellation(tx, reservation, {
      deadlineHours,
      now: reservationDeadlineNow(),
      cancellationReason,
      cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN,
    });
    if (!result.success) {
      return { success: false, error: result.error };
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
  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  // 最小/最大予約時間（設定値）をサーバー側で強制する（新規予約と同一ルール）
  const rules = await getReservationRuleSettings();
  const durationError = checkReservationDuration(
    (endDateTime.getTime() - startDateTime.getTime()) / 60000,
    rules,
  );
  if (durationError) {
    return { success: false, error: durationError };
  }

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

    await lockReservationSpaceForTransaction(tx, input.spaceId);

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
    const hours = calculateDurationHours(startDateTime, endDateTime);

    const spaceDiscount:
      import("@/shared/lib/pricing/types").SpaceDiscountSettings | null =
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
