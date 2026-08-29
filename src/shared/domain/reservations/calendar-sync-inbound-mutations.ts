import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  ACTIVE_RESERVATION_STATUSES,
  CANCELLED_BY,
} from "@/shared/lib/validations/enums/helpers";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { checkSpaceOverlap } from "@/shared/domain/spaces/overlap";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import { formatDateTimeFull, formatTimeShort } from "@/shared/lib/date-format";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import {
  buildPricingSettings,
  getReservationSettings,
  releaseCouponUsage,
} from "./payloads";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import { lockSpaceForTransaction } from "./space-locks";

/**
 * GCal 上でイベントが削除されたことを検知した際の自動キャンセル理由（SSoT）。
 * `cancelReservationFromCalendar` の DB claim と、呼出側 (`inbound.ts`) が
 * `applyCancellationSideEffects` に渡す `cancellationReason` を一致させる。
 */
export const GCAL_DELETE_CANCELLATION_REASON =
  "Google Calendar 上でイベントが削除されたため自動キャンセル";

export type CancelReservationFromCalendarResult = {
  /** true = atomic claim 成功（CONFIRMED/PENDING → CANCELLED）。呼出側はこの後
   * `applyCancellationSideEffects` を呼んで副作用チェーンを発火すること。 */
  cancelled: boolean;
};

/**
 * Google Calendar 上でイベントが削除されたことを検知した際、DB 側の予約を
 * atomic claim で CANCELLED に遷移させる（GCAL-AUDIT-03）。
 *
 * GCal 側の削除が正本（source of truth）であるため、顧客キャンセル期限等の
 * デッドラインチェックは行わない（客がキャンセル不可期間でも GCal 側の削除は
 * 常に反映する）。`ACTIVE_RESERVATION_STATUSES`（PENDING/CONFIRMED）以外は
 * 対象外（既に終端状態）。
 *
 * DB 更新のみを担当し、返金・メール・通知・SmartLock 等の副作用は担当しない
 * （呼出側 `inbound.ts` が claim 成功時に `applyCancellationSideEffects` を呼ぶ、
 * `pending-expiry.ts` と同型の分離）。
 */
export async function cancelReservationFromCalendar(input: {
  reservationId: string;
  existingNotes: string | null;
}): Promise<CancelReservationFromCalendarResult> {
  const preClaim = await prisma.reservation.findFirst({
    where: { id: input.reservationId, deletedAt: null },
    select: {
      spaceId: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
    },
  });

  const syncNote = `[Google Calendarで削除] ${formatDateTimeFull(new Date())}`;
  const newNotes = input.existingNotes
    ? `${input.existingNotes}\n${syncNote}`
    : syncNote;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // 占有解放も規約8の対象（他の cancel 経路 customer-commands / lifecycle-commands /
    // pending-expiry / series-commands と同型）。単独では EXCLUDE 違反を作らないが、
    // lock を取らずに解放すると並行する新規予約 create が本 tx の commit 前後で
    // overlap を誤判定しうる。
    if (preClaim?.spaceId) {
      await lockSpaceForTransaction(tx, preClaim.spaceId);
    }

    const claimed = await tx.reservation.updateMany({
      where: {
        id: input.reservationId,
        deletedAt: null,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: now,
        cancelledByType: CANCELLED_BY.SYSTEM,
        cancellationReason: GCAL_DELETE_CANCELLATION_REASON,
        icsSequence: { increment: 1 },
        googleCalendarEventId: null,
        calendarSyncedAt: now,
        calendarSyncError: null,
        notes: newNotes,
      },
    });

    if (claimed.count === 0) {
      return { cancelled: false };
    }

    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: { couponId: true },
    });

    if (reservation?.couponId) {
      await releaseCouponUsage(tx, { couponId: reservation.couponId });
    }

    return { cancelled: true };
  }, RESERVATION_WRITE_TX_OPTIONS);

  if (
    result.cancelled &&
    preClaim?.paymentStatus === PaymentStatus.PENDING &&
    preClaim.stripeCheckoutSessionId
  ) {
    await expireOpenCheckoutSessionBestEffort({
      sessionId: preClaim.stripeCheckoutSessionId,
      context: { reservationId: input.reservationId },
    });
  }

  return result;
}

export type ApplyCalendarTimeChangeResult =
  | { success: true }
  | {
      success: false;
      reason: "overlap";
      conflictingReservation: {
        id: string;
        startTime: Date;
        endTime: Date;
      };
    }
  | { success: false; reason: "payment_race" }
  | { success: false; reason: "pricing_unavailable" };

export async function applyCalendarTimeChange(input: {
  reservationId: string;
  spaceId: string;
  existingNotes: string | null;
  startTime: Date;
  endTime: Date;
}): Promise<ApplyCalendarTimeChangeResult> {
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    return { success: false, reason: "pricing_unavailable" };
  }

  const ratePlans = await getSpaceRatePlans(input.spaceId);
  const reservationSettings = buildPricingSettings(
    await getReservationSettings(),
  );

  return prisma.$transaction(async (tx) => {
    await lockSpaceForTransaction(tx, input.spaceId);

    const reservation = await tx.reservation.findFirst({
      where: {
        id: input.reservationId,
        deletedAt: null,
        paymentStatus: PaymentStatus.UNPAID,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      select: {
        id: true,
        startTime: true,
        taxRate: true,
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
          },
        },
      },
    });

    if (!reservation) {
      return { success: false as const, reason: "payment_race" as const };
    }

    const space = await tx.space.findUnique({
      where: { id: input.spaceId },
      select: {
        hourlyPrice: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
        taxRateType: true,
      },
    });

    if (!space) {
      return {
        success: false as const,
        reason: "pricing_unavailable" as const,
      };
    }

    const overlap = await checkSpaceOverlap(
      {
        spaceId: input.spaceId,
        startTime: input.startTime,
        endTime: input.endTime,
        excludeReservationId: input.reservationId,
      },
      tx,
    );

    if (overlap.hasOverlap) {
      const conflictLabel =
        overlap.type === "event" ? "重複イベント枠ID" : "重複予約ID";
      const rejectionNote =
        `[カレンダー同期エラー] ${formatDateTimeFull(new Date())}\n` +
        `時間変更が重複のため拒否されました。\n` +
        `試行時間: ${formatDateTimeFull(input.startTime)} - ${formatTimeShort(input.endTime)}\n` +
        `${conflictLabel}: ${overlap.conflictId.slice(0, 8).toUpperCase()}`;

      const newNotes = input.existingNotes
        ? `${input.existingNotes}\n\n${rejectionNote}`
        : rejectionNote;

      await tx.reservation.update({
        where: { id: input.reservationId },
        data: {
          notes: newNotes,
          calendarSyncError: `Time change rejected: overlapping ${overlap.type}`,
        },
      });

      return {
        success: false as const,
        reason: "overlap" as const,
        conflictingReservation: {
          id: overlap.conflictId,
          startTime: overlap.startTime,
          endTime: overlap.endTime,
        },
      };
    }

    const coupon = reservation.coupon;
    // 適用前の参照。時間変更で適用外になったら usage を返す必要がある。
    const previousCouponId = coupon?.id ?? null;
    const couponForCalc =
      coupon &&
      new Date(coupon.validFrom) <= input.startTime &&
      (!coupon.validUntil || new Date(coupon.validUntil) >= input.endTime)
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

    const pricing = calculateReservationPricing({
      startDateTime: input.startTime,
      endDateTime: input.endTime,
      space: {
        hourlyPrice: space.hourlyPrice,
        discountType: space.discountType,
        discountValue: space.discountValue,
        durationDiscountOverride: space.durationDiscountOverride,
        taxRateType: space.taxRateType,
      },
      ratePlans,
      reservationSettings,
      coupon: couponForCalc,
      holidayJudge: isJapaneseHoliday,
    });

    const taxRate = reservation.taxRate ? reservation.taxRate : 0;
    const taxAmount = Math.round((pricing.totalPrice * taxRate) / 100);

    const updated = await tx.reservation.updateMany({
      where: {
        id: input.reservationId,
        deletedAt: null,
        paymentStatus: PaymentStatus.UNPAID,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      data: {
        startTime: input.startTime,
        endTime: input.endTime,
        basePrice: pricing.basePrice,
        totalPrice: pricing.totalPrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        couponDiscountAmount: pricing.couponDiscountAmount,
        taxAmount,
        totalPriceWithTax: pricing.totalPrice + taxAmount,
        // `total_price` を自動計算値で書き直す以上、手動調整分も必ず一緒に消す。
        // CHECK `reservations_total_price_breakdown_check` は
        // `total_price = GREATEST(0, base - 各割引) + COALESCE(manual_adjustment_amount, 0)`
        // なので、admin が金額を上書きした予約（manual_adjustment_amount ≠ 0）を
        // ここで時間変更すると 23514 で tx が abort する。abort は inbound sync 全体を
        // 止める（token が進まず同じ変更が再配信され続ける）ので、通知も出ない。
        // `priceOverriddenById: null` と同じ意図＝「自動再計算に戻す」。
        manualAdjustmentAmount: null,
        priceOverriddenById: null,
        couponId: pricing.appliedCoupon?.id ?? null,
        calendarSyncedAt: new Date(),
        calendarSyncError: null,
        icsSequence: { increment: 1 },
        // 日時が変わったリマインダは無効。endTime だけの変更では触らない。
        ...(reservation.startTime.getTime() !== input.startTime.getTime()
          ? { reminderSentAt: null }
          : {}),
      },
    });

    if (updated.count === 0) {
      return { success: false as const, reason: "payment_race" as const };
    }

    // 時間変更でクーポンが適用外になったら（有効期間の外へ移動 / BEST で
    // 長時間割引が勝つ）`couponId` は null に書き換わる。`usage_count` を
    // 返さないと、その 1 回は**誰も使っていないのに永久に消費されたまま**になる。
    // `usageLimit` 付きのクーポンでは、その 1 枠が二度と配れない。
    //
    // `couponForCalc` は `reservation.coupon` そのものか null のどちらかなので、
    // 遷移は「同じ id のまま」か「null になる」の 2 通りしかない（別の id へ
    // 移ることはない）。したがって claim 側は要らない。
    if (previousCouponId !== null && pricing.appliedCoupon === null) {
      await releaseCouponUsage(tx, { couponId: previousCouponId });
    }

    return { success: true as const };
  }, RESERVATION_WRITE_TX_OPTIONS);
}
