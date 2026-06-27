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
  calculatePricing,
  buildPayload,
} from "./payloads";

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
        couponId: true,
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

  let updatedIcsSequence = 0;

  await prisma.$transaction(async (tx) => {
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
  });

  return {
    googleCalendarEventId: currentReservation.googleCalendarEventId,
    customerId: input.customerId,
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
