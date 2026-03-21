import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  calculateReservationPrice,
  parseDurationDiscountRules,
} from "@/shared/lib/pricing";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

type ValidatedCoupon = {
  id: string;
  code: string;
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  maxDiscountAmount: number | null;
  canCombineWithDurationDiscount: boolean;
} | null;

function buildDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

async function getReservationSettings() {
  return prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      durationDiscountEnabled: true,
      durationDiscountRules: true,
      discountCombinationMode: true,
    },
  });
}

async function validateCoupon(
  code: string | null | undefined,
  basePrice: number,
  tx?: typeof prisma,
): Promise<ValidatedCoupon> {
  if (!code || !code.trim()) {
    return null;
  }

  const normalizedCode = code.toUpperCase().trim();
  if (normalizedCode.length < 4 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  const coupon = await (tx ?? prisma).coupon.findUnique({
    where: { code: normalizedCode },
  });
  const now = new Date();

  if (!coupon || !coupon.isActive) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (
    coupon.validFrom > now ||
    (coupon.validUntil && coupon.validUntil < now)
  ) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (
    coupon.minReservationAmount !== null &&
    basePrice < coupon.minReservationAmount
  ) {
    throw new DomainError(
      `このクーポンは¥${coupon.minReservationAmount.toLocaleString()}以上のご利用で適用できます`,
      "VALIDATION",
    );
  }

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
    canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
  };
}

type ReservationNotificationPayload = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string | undefined;
  location?: string | undefined;
};

type ReservationCalendarPayload = ReservationNotificationPayload;

export async function createAdminReservationCommand(input: {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  customerId?: string | undefined;
  customerData?: {
    lastName: string;
    firstName: string;
    email: string;
    phoneNumber?: string | null | undefined;
  };
  totalPrice?: number | undefined;
  couponCode?: string | null | undefined;
  manualDiscountAmount?: number | undefined;
  manualDiscountReason?: string | null | undefined;
  status: ReservationStatus;
  notes?: string | null | undefined;
}) {
  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  const [space, overlapCheck, settings] = await Promise.all([
    prisma.space.findUnique({
      where: { id: input.spaceId, isActive: true },
      select: {
        id: true,
        name: true,
        addressDetail: true,
        hourlyPrice: true,
        location: { select: { address: true } },
      },
    }),
    checkReservationOverlap({
      spaceId: input.spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
    }),
    getReservationSettings(),
  ]);

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  if (overlapCheck.hasOverlap) {
    throw new DomainError(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      "CONFLICT",
    );
  }

  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const basePrice = Math.floor(space.hourlyPrice * hours);
  const validatedCoupon = await validateCoupon(input.couponCode, basePrice);

  const priceCalculation = calculateReservationPrice({
    hourlyPrice: space.hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  const calculatedPrice = input.totalPrice ?? priceCalculation.totalPrice;
  const couponId = priceCalculation.appliedCoupon?.id ?? null;
  const couponDiscountAmount =
    priceCalculation.couponDiscount > 0
      ? priceCalculation.couponDiscount
      : null;
  const durationDiscountAmount =
    priceCalculation.durationDiscount > 0
      ? priceCalculation.durationDiscount
      : null;

  const reservation = await prisma.$transaction(async (tx) => {
    const overlapCheckTx = await checkReservationOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );
    if (overlapCheckTx.hasOverlap) {
      throw new DomainError(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
        "CONFLICT",
      );
    }

    let resolvedCustomerId = input.customerId;

    if (!resolvedCustomerId && input.customerData) {
      let customer = await tx.customer.findUnique({
        where: { email: input.customerData.email },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            lastName: input.customerData.lastName,
            firstName: input.customerData.firstName,
            email: input.customerData.email,
            phoneNumber: input.customerData.phoneNumber || null,
          },
        });
      } else {
        customer = await tx.customer.update({
          where: { email: input.customerData.email },
          data: {
            lastName: input.customerData.lastName,
            firstName: input.customerData.firstName,
            phoneNumber: input.customerData.phoneNumber || customer.phoneNumber,
          },
        });
      }

      resolvedCustomerId = customer.id;
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
        couponId,
        couponDiscountAmount,
        durationDiscountAmount,
        notes:
          input.manualDiscountAmount && input.manualDiscountReason
            ? `${input.notes || ""}\n【手動割引】¥${input.manualDiscountAmount.toLocaleString()} - ${input.manualDiscountReason}`.trim()
            : input.notes || null,
        status: input.status,
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (couponId) {
      await tx.coupon.update({
        where: { id: couponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    const customer = await tx.customer.findUnique({
      where: { id: resolvedCustomerId },
      select: { firstReservationAt: true },
    });

    await tx.customer.update({
      where: { id: resolvedCustomerId },
      data: {
        totalReservations: { increment: 1 },
        lastReservationAt: new Date(),
        firstReservationAt: customer?.firstReservationAt ?? new Date(),
      },
    });

    return createdReservation;
  });

  const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
  const notes = input.notes ?? undefined;

  return {
    id: reservation.id,
    notification: {
      reservationId: reservation.id,
      customerEmail: reservation.customer.email,
      customerName,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes,
      location: formatSpaceLineAddress(
        space.location.address,
        space.addressDetail,
      ),
    } satisfies ReservationNotificationPayload,
    calendar: {
      reservationId: reservation.id,
      customerEmail: reservation.customer.email,
      customerName,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes,
      location: formatSpaceLineAddress(
        space.location.address,
        space.addressDetail,
      ),
    } satisfies ReservationCalendarPayload,
  };
}

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
      where: { id },
      select: {
        id: true,
        couponId: true,
        googleCalendarEventId: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.space.findUnique({
      where: { id: input.spaceId, isActive: true },
      select: {
        id: true,
        name: true,
        addressDetail: true,
        hourlyPrice: true,
        location: { select: { address: true } },
      },
    }),
    getReservationSettings(),
  ]);

  if (!currentReservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  const overlapCheck = await checkReservationOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    excludeReservationId: id,
  });
  if (overlapCheck.hasOverlap) {
    throw new DomainError(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      "CONFLICT",
    );
  }

  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const basePrice = Math.floor(space.hourlyPrice * hours);
  const validatedCoupon = await validateCoupon(input.couponCode, basePrice);
  const newCouponId = validatedCoupon?.id ?? null;

  const priceCalculation = calculateReservationPrice({
    hourlyPrice: space.hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  const calculatedPrice = input.totalPrice ?? priceCalculation.totalPrice;
  const couponDiscountAmount =
    priceCalculation.couponDiscount > 0
      ? priceCalculation.couponDiscount
      : null;
  const durationDiscountAmount =
    priceCalculation.durationDiscount > 0
      ? priceCalculation.durationDiscount
      : null;
  const oldCouponId = currentReservation.couponId;
  const couponChanged = oldCouponId !== newCouponId;

  await prisma.$transaction(async (tx) => {
    const overlapCheckTx = await checkReservationOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        excludeReservationId: id,
      },
      tx,
    );

    if (overlapCheckTx.hasOverlap) {
      throw new DomainError(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
        "CONFLICT",
      );
    }

    await tx.reservation.update({
      where: { id },
      data: {
        spaceId: input.spaceId,
        customerId: input.customerId,
        startTime: startDateTime,
        endTime: endDateTime,
        status: input.status,
        totalPrice: calculatedPrice,
        basePrice,
        couponId: newCouponId,
        couponDiscountAmount,
        durationDiscountAmount,
        notes: input.notes || null,
      },
    });

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

  const customerName = `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`;

  return {
    googleCalendarEventId: currentReservation.googleCalendarEventId,
    notification: {
      reservationId: id,
      customerEmail: currentReservation.customer.email,
      customerName,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: input.notes ?? undefined,
      location: formatSpaceLineAddress(
        space.location.address,
        space.addressDetail,
      ),
    } satisfies ReservationNotificationPayload,
  };
}

export async function updateReservationStatusCommand(
  id: string,
  status: ReservationStatus,
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  const previousStatus = reservation.status;

  await prisma.reservation.update({
    where: { id },
    data: { status },
  });

  const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
  const payload = {
    reservationId: id,
    customerEmail: reservation.customer.email,
    customerName,
    spaceName: reservation.space.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes ?? undefined,
    location: formatSpaceLineAddress(
      reservation.space.location.address,
      reservation.space.addressDetail,
    ),
  } satisfies ReservationNotificationPayload;

  return {
    previousStatus,
    googleCalendarEventId: reservation.googleCalendarEventId,
    notification: payload,
  };
}

export async function updateReservationNotesCommand(
  id: string,
  notes: string | null,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  await prisma.reservation.update({
    where: { id },
    data: { notes },
  });
}

export async function deleteReservationCommand(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { id: true, googleCalendarEventId: true },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  await prisma.reservation.delete({
    where: { id },
  });

  return {
    googleCalendarEventId: reservation.googleCalendarEventId,
  };
}

type PublicReservationInput = {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  notes?: string | null | undefined;
};

export async function createPublicReservationCommand(
  input: PublicReservationInput,
) {
  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId, isActive: true, isPublished: true },
    select: {
      id: true,
      name: true,
      addressDetail: true,
      hourlyPrice: true,
      location: { select: { address: true } },
    },
  });

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  const overlapCheck = await checkReservationOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
  });

  if (overlapCheck.hasOverlap) {
    throw new DomainError(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      "CONFLICT",
    );
  }

  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const basePrice = Math.floor(Number(space.hourlyPrice) * hours);

  const reservation = await prisma.$transaction(async (tx) => {
    const overlapCheckTx = await checkReservationOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );
    if (overlapCheckTx.hasOverlap) {
      throw new DomainError(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
        "CONFLICT",
      );
    }

    let customer = await tx.customer.findUnique({
      where: { email: input.email },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          lastName: input.lastName,
          firstName: input.firstName,
          email: input.email,
          phoneNumber: input.phoneNumber || null,
        },
      });
    } else {
      customer = await tx.customer.update({
        where: { email: input.email },
        data: {
          lastName: input.lastName,
          firstName: input.firstName,
          phoneNumber: input.phoneNumber || customer.phoneNumber,
        },
      });
    }

    const created = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId: customer.id,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: basePrice,
        basePrice,
        status: ReservationStatus.PENDING,
        notes: input.notes || null,
      },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const firstReservationAt = customer.firstReservationAt;
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalReservations: { increment: 1 },
        lastReservationAt: new Date(),
        ...(firstReservationAt === null
          ? { firstReservationAt: new Date() }
          : {}),
      },
    });

    return created;
  });

  const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;

  return {
    id: reservation.id,
    notification: {
      reservationId: reservation.id,
      customerEmail: reservation.customer.email,
      customerName,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: basePrice,
      notes: input.notes ?? undefined,
      location: formatSpaceLineAddress(
        space.location.address,
        space.addressDetail,
      ),
    } satisfies ReservationNotificationPayload,
  };
}
