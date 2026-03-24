import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CouponType, ReservationStatus } from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import {
  getValidDiscountCombinationMode,
  CREATABLE_RESERVATION_STATUSES,
} from "@/shared/lib/validations/enums/helpers";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidatedCoupon = {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountValue: number;
  maxDiscountAmount: number | null;
  canCombineWithDurationDiscount: boolean;
} | null;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type CustomerData = {
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
};

export type ReservationPayload = {
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function calculateHoursAndBasePrice(
  startDateTime: Date,
  endDateTime: Date,
  hourlyPrice: number,
) {
  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const basePrice = Math.floor(hourlyPrice * hours);
  return { hours, basePrice };
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
  tx?: Tx,
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

async function ensureNoOverlap(
  params: {
    spaceId: string;
    startTime: Date;
    endTime: Date;
    excludeReservationId?: string;
  },
  tx?: Tx,
): Promise<void> {
  const result = await checkReservationOverlap(params, tx);
  if (result.hasOverlap) {
    throw new DomainError(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      "CONFLICT",
    );
  }
}

async function resolveOrCreateCustomer(
  tx: Tx,
  data: CustomerData,
): Promise<string> {
  const customer = await tx.customer.upsert({
    where: { email: data.email },
    create: {
      lastName: data.lastName,
      firstName: data.firstName,
      email: data.email,
      phoneNumber: data.phoneNumber || null,
    },
    update: {
      lastName: data.lastName,
      firstName: data.firstName,
      ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
    },
    select: { id: true },
  });
  return customer.id;
}

async function incrementCustomerReservationStats(
  tx: Tx,
  customerId: string,
): Promise<void> {
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { firstReservationAt: true },
  });
  const now = new Date();
  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalReservations: { increment: 1 },
      lastReservationAt: now,
      ...(customer.firstReservationAt === null
        ? { firstReservationAt: now }
        : {}),
    },
  });
}

function calculatePricing(params: {
  hourlyPrice: number;
  hours: number;
  basePrice: number;
  settings: Awaited<ReturnType<typeof getReservationSettings>>;
  coupon: ValidatedCoupon;
}) {
  const priceCalculation = calculateReservationPrice({
    hourlyPrice: params.hourlyPrice,
    hours: params.hours,
    durationRules: parseDurationDiscountRules(
      params.settings?.durationDiscountRules,
    ),
    durationDiscountEnabled: params.settings?.durationDiscountEnabled ?? false,
    coupon: params.coupon,
    combinationMode: getValidDiscountCombinationMode(
      params.settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  return {
    totalPrice: priceCalculation.totalPrice,
    couponId: priceCalculation.appliedCoupon?.id ?? null,
    couponDiscountAmount:
      priceCalculation.couponDiscount > 0
        ? priceCalculation.couponDiscount
        : null,
    durationDiscountAmount:
      priceCalculation.durationDiscount > 0
        ? priceCalculation.durationDiscount
        : null,
  };
}

function buildPayload(params: {
  reservationId: string;
  customer: { lastName: string; firstName: string; email: string };
  space: {
    name: string;
    addressDetail: string | null;
    location: { address: string };
  };
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string | null | undefined;
}): ReservationPayload {
  return {
    reservationId: params.reservationId,
    customerEmail: params.customer.email,
    customerName: `${params.customer.lastName} ${params.customer.firstName}`,
    spaceName: params.space.name,
    startTime: params.startTime,
    endTime: params.endTime,
    totalPrice: params.totalPrice,
    notes: params.notes ?? undefined,
    location: formatSpaceLineAddress(
      params.space.location.address,
      params.space.addressDetail,
    ),
  };
}

const ALLOWED_TRANSITIONS: ReadonlyMap<
  ReservationStatus,
  readonly ReservationStatus[]
> = new Map([
  [
    ReservationStatus.PENDING,
    [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  ],
  [
    ReservationStatus.CONFIRMED,
    [
      ReservationStatus.COMPLETED,
      ReservationStatus.NO_SHOW,
      ReservationStatus.CANCELLED,
    ],
  ],
]);

export function validateStatusTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS.get(from);
  if (!allowed || !allowed.includes(to)) {
    throw new DomainError("このステータスからは変更できません", "VALIDATION");
  }
}

const SPACE_SELECT = {
  id: true,
  name: true,
  addressDetail: true,
  hourlyPrice: true,
  location: { select: { address: true } },
} as const;

const CUSTOMER_SELECT = {
  firstName: true,
  lastName: true,
  email: true,
} as const;

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
        tx,
        input.customerData,
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
        notes:
          input.manualDiscountAmount && input.manualDiscountReason
            ? `${input.notes || ""}\n【手動割引】¥${input.manualDiscountAmount.toLocaleString()} - ${input.manualDiscountReason}`.trim()
            : input.notes || null,
        status: input.status,
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
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: input.notes,
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
      where: { id },
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
  });

  const calculatedPrice = input.totalPrice ?? pricing.totalPrice;
  const newCouponId = validatedCoupon?.id ?? null;
  const oldCouponId = currentReservation.couponId;
  const couponChanged = oldCouponId !== newCouponId;

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
        couponDiscountAmount: pricing.couponDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
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

  return {
    googleCalendarEventId: currentReservation.googleCalendarEventId,
    payload: buildPayload({
      reservationId: id,
      customer: currentReservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: input.notes,
    }),
  };
}

// ---------------------------------------------------------------------------
// Admin: Status update
// ---------------------------------------------------------------------------

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
      customer: { select: CUSTOMER_SELECT },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  validateStatusTransition(reservation.status, status);

  const previousStatus = reservation.status;

  await prisma.reservation.update({
    where: { id },
    data: { status },
  });

  return {
    previousStatus,
    googleCalendarEventId: reservation.googleCalendarEventId,
    payload: buildPayload({
      reservationId: id,
      customer: reservation.customer,
      space: reservation.space,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      totalPrice: reservation.totalPrice,
      notes: reservation.notes,
    }),
  };
}

// ---------------------------------------------------------------------------
// Admin: Notes update
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Admin: Delete
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public: Create
// ---------------------------------------------------------------------------

type PublicReservationInput = {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
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
    select: SPACE_SELECT,
  });

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  await ensureNoOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
  });

  const { basePrice } = calculateHoursAndBasePrice(
    startDateTime,
    endDateTime,
    space.hourlyPrice,
  );

  const reservation = await prisma.$transaction(async (tx) => {
    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );

    const customerId = await resolveOrCreateCustomer(tx, {
      lastName: input.lastName,
      firstName: input.firstName,
      email: input.email,
      phoneNumber: input.phoneNumber,
    });

    const created = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: basePrice,
        basePrice,
        status: ReservationStatus.PENDING,
        notes: input.notes || null,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    await incrementCustomerReservationStats(tx, customerId);

    return created;
  });

  return {
    id: reservation.id,
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: basePrice,
      notes: input.notes,
    }),
  };
}
