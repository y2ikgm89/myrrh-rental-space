import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { CREATABLE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { validateStatusTransition } from "./status";
import {
  resolveOrCreateCustomer,
  type CustomerData,
} from "@/shared/domain/reservations/resolve-customer";
import {
  CUSTOMER_SELECT,
  buildDateTime,
  calculateHoursAndBasePrice,
  getReservationSettings,
  validateCoupon,
  ensureNoOverlap,
  incrementCustomerReservationStats,
  recomputeCustomerReservationStats,
  calculatePricing,
  buildPayload,
} from "./payloads";
import { lockReservationSpaceForTransaction } from "./locks";

const SPACE_SELECT = {
  id: true,
  name: true,
  addressDetail: true,
  hourlyPrice: true,
  discountType: true,
  discountValue: true,
  durationDiscountOverride: true,
  location: { select: { address: true } },
} as const;

function buildSpaceDiscount(space: {
  discountType: import("@/shared/lib/pricing/types").SpaceDiscountSettings["discountType"];
  discountValue: number | null;
  durationDiscountOverride: import("@/shared/lib/pricing/types").SpaceDiscountSettings["durationDiscountOverride"];
}): import("@/shared/lib/pricing/types").SpaceDiscountSettings | null {
  if (
    space.discountType === "none" ||
    space.discountValue == null ||
    space.discountValue <= 0
  ) {
    return null;
  }
  return {
    discountType: space.discountType,
    discountValue: space.discountValue,
    durationDiscountOverride: space.durationDiscountOverride,
  };
}

// ---------------------------------------------------------------------------
// Admin: Create
// ---------------------------------------------------------------------------

export async function createAdminReservationCommand(input: {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  customerId?: string | undefined;
  customerData?: CustomerData;
  totalPrice?: number | undefined;
  couponCode?: string | null | undefined;
  manualDiscountAmount?: number | undefined;
  manualDiscountReason?: string | null | undefined;
  status: ReservationStatus;
  notes?: string | null | undefined;
}) {
  if (!CREATABLE_RESERVATION_STATUSES.includes(input.status)) {
    throw new DomainError(
      "作成時のステータスは「保留中」または「確認済み」のみ指定できます",
      "VALIDATION",
    );
  }

  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  const [space, , settings] = await Promise.all([
    prisma.space.findUnique({
      where: { id: input.spaceId, isActive: true },
      select: SPACE_SELECT,
    }),
    ensureNoOverlap({
      spaceId: input.spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
    }),
    getReservationSettings(),
  ]);

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  const { hours, basePrice } = calculateHoursAndBasePrice(
    startDateTime,
    endDateTime,
    space.hourlyPrice,
  );
  const validatedCoupon = await validateCoupon(input.couponCode, basePrice);
  const pricing = calculatePricing({
    hourlyPrice: space.hourlyPrice,
    hours,
    basePrice,
    settings,
    coupon: validatedCoupon,
    spaceDiscount: buildSpaceDiscount(space),
  });

  const calculatedPrice = input.totalPrice ?? pricing.totalPrice;

  const reservation = await prisma.$transaction(async (tx) => {
    await lockReservationSpaceForTransaction(tx, input.spaceId);

    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );

    let resolvedCustomerId = input.customerId;

    if (!resolvedCustomerId && input.customerData) {
      resolvedCustomerId = await resolveOrCreateCustomer(
        input.customerData,
        tx,
      );
    }

    if (!resolvedCustomerId) {
      throw new DomainError("顧客IDが解決できませんでした", "VALIDATION");
    }

    const createdReservation = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId: resolvedCustomerId,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: calculatedPrice,
        basePrice,
        couponId: pricing.couponId,
        couponDiscountAmount: pricing.couponDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        notes:
          input.manualDiscountAmount && input.manualDiscountReason
            ? `${input.notes || ""}\n【手動割引】¥${input.manualDiscountAmount.toLocaleString()} - ${input.manualDiscountReason}`.trim()
            : input.notes || null,
        status: input.status,
        // Guest contact info (管理者入力の場合は customerData から記録)
        ...(input.customerData && {
          guestLastName: input.customerData.lastName,
          guestFirstName: input.customerData.firstName,
          guestEmail: input.customerData.email,
          guestPhone: input.customerData.phoneNumber || null,
          guestCompanyName: input.customerData.companyName || null,
          guestCustomerType: input.customerData.customerType ?? null,
        }),
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    if (pricing.couponId) {
      await tx.coupon.update({
        where: { id: pricing.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    await incrementCustomerReservationStats(tx, resolvedCustomerId);

    return createdReservation;
  });

  return {
    id: reservation.id,
    customerId: reservation.customerId,
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: input.notes,
      icsSequence: reservation.icsSequence,
    }),
  };
}

// ---------------------------------------------------------------------------
// Admin: Update
// ---------------------------------------------------------------------------

export async function updateAdminReservationCommand(
  id: string,
  input: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId: string;
    totalPrice?: number | undefined;
    couponCode?: string | null | undefined;
    status: ReservationStatus;
    notes?: string | null | undefined;
  },
) {
  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  const [currentReservation, space, settings] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        spaceId: true,
        startTime: true,
        endTime: true,
        totalPrice: true,
        couponId: true,
        // 予約再割当時の旧 customer stat 再計算に必要 (Codex data-retention レビュー
        // 経由で発覚した stale stat bug の修正 — 詳細は tx 内 comment 参照)
        customerId: true,
        googleCalendarEventId: true,
        customer: { select: CUSTOMER_SELECT },
      },
    }),
    prisma.space.findUnique({
      where: { id: input.spaceId, isActive: true },
      select: SPACE_SELECT,
    }),
    getReservationSettings(),
  ]);

  if (!currentReservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  // CANCELLED/COMPLETED/NO_SHOW への遷移は返金・キャンセルメール等の副作用チェーン
  // （applyCancellationSideEffects 等）を経由しないため、この編集フォームからは許可しない。
  // 終端ステータスへの変更は予約詳細画面の専用ステータス変更経路から行う。
  if (
    input.status !== currentReservation.status &&
    !CREATABLE_RESERVATION_STATUSES.includes(input.status)
  ) {
    throw new DomainError(
      "このステータスへの変更は予約詳細画面のステータス変更から行ってください",
      "VALIDATION",
    );
  }

  validateStatusTransition(currentReservation.status, input.status);

  await ensureNoOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    excludeReservationId: id,
  });

  const { hours, basePrice } = calculateHoursAndBasePrice(
    startDateTime,
    endDateTime,
    space.hourlyPrice,
  );
  const validatedCoupon = await validateCoupon(input.couponCode, basePrice);
  const pricing = calculatePricing({
    hourlyPrice: space.hourlyPrice,
    hours,
    basePrice,
    settings,
    coupon: validatedCoupon,
    spaceDiscount: buildSpaceDiscount(space),
  });

  const calculatedPrice = input.totalPrice ?? pricing.totalPrice;
  const newCouponId = validatedCoupon?.id ?? null;
  const oldCouponId = currentReservation.couponId;
  const couponChanged = oldCouponId !== newCouponId;

  // 顧客に影響する変更があった場合のみ、呼び出し側が変更通知メールを送る判断材料にする。
  const customerVisibleChanged =
    currentReservation.spaceId !== input.spaceId ||
    currentReservation.startTime.getTime() !== startDateTime.getTime() ||
    currentReservation.endTime.getTime() !== endDateTime.getTime() ||
    currentReservation.totalPrice !== calculatedPrice;

  let updatedIcsSequence = 0;

  await prisma.$transaction(async (tx) => {
    await lockReservationSpaceForTransaction(tx, input.spaceId);

    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        excludeReservationId: id,
      },
      tx,
    );

    const updatedReservation = await tx.reservation.update({
      where: { id, deletedAt: null },
      data: {
        spaceId: input.spaceId,
        customerId: input.customerId,
        startTime: startDateTime,
        endTime: endDateTime,
        status: input.status,
        totalPrice: calculatedPrice,
        basePrice,
        couponId: newCouponId,
        couponDiscountAmount: pricing.couponDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        notes: input.notes || null,
        icsSequence: { increment: 1 },
      },
      select: { icsSequence: true },
    });
    updatedIcsSequence = updatedReservation.icsSequence;

    if (couponChanged) {
      if (oldCouponId) {
        await tx.coupon.updateMany({
          where: { id: oldCouponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
      if (newCouponId) {
        await tx.coupon.update({
          where: { id: newCouponId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    // 予約再割当時: 旧 customer と新 customer の両方の予約統計を
    // Reservation 実履歴から再計算する。
    //
    // 修正前は customerId だけ書き換わり `Customer.totalReservations` /
    // `totalSpent` / `firstReservationAt` / `lastReservationAt` が旧値のままで、
    // 管理 UI の顧客カード、customer-risk-scan cron、data-retention cron の
    // dormancy 判定 (最新実装は Reservation 実履歴で行うため直接影響しないが、
    // 他消費面は cached stat を参照する) に stale 値が silently 伝播していた。
    // Codex #3564883654 / #3564905126 の data-retention レビュー中に副次発覚。
    //
    // totalPrice のみ変更 (同一 customer) のケースは既存パターンに合わせて
    // recompute しない — increment path 側でも totalSpent は維持していない
    // 既知の pre-existing hole であり、本 PR のスコープ外。
    if (currentReservation.customerId !== input.customerId) {
      await recomputeCustomerReservationStats(
        tx,
        currentReservation.customerId,
      );
      await recomputeCustomerReservationStats(tx, input.customerId);
    }
  });

  return {
    googleCalendarEventId: currentReservation.googleCalendarEventId,
    customerId: input.customerId,
    customerVisibleChanged,
    payload: buildPayload({
      reservationId: id,
      customer: currentReservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: input.notes,
      icsSequence: updatedIcsSequence,
    }),
  };
}
