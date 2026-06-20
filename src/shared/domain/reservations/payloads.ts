import "server-only";
import { calculateDurationHours } from "@/shared/lib/date-format";

import { prisma } from "@/shared/db/prisma";
import { CouponType } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
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

export type ReservationPayload = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  companyName?: string | null;
  guestName?: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string | undefined;
  location?: string | undefined;
  icsSequence: number;
};

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

export const CUSTOMER_SELECT = {
  firstName: true,
  lastName: true,
  companyName: true,
  email: true,
} as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function buildDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function calculateHoursAndBasePrice(
  startDateTime: Date,
  endDateTime: Date,
  hourlyPrice: number,
) {
  const hours = calculateDurationHours(startDateTime, endDateTime);
  const basePrice = Math.floor(hourlyPrice * hours);
  return { hours, basePrice };
}

export async function getReservationSettings() {
  return prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      durationDiscountEnabled: true,
      durationDiscountRules: true,
      discountCombinationMode: true,
    },
  });
}

export async function validateCoupon(
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

export async function ensureNoOverlap(
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

export async function incrementCustomerReservationStats(
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

export function calculatePricing(params: {
  hourlyPrice: number;
  hours: number;
  basePrice: number;
  settings: Awaited<ReturnType<typeof getReservationSettings>>;
  coupon: ValidatedCoupon;
  spaceDiscount?:
    | import("@/shared/lib/pricing/types").SpaceDiscountSettings
    | null;
}) {
  const priceCalculation = calculateReservationPrice({
    hourlyPrice: params.hourlyPrice,
    hours: params.hours,
    durationRules: parseDurationDiscountRules(
      params.settings?.durationDiscountRules,
    ),
    durationDiscountEnabled: params.settings?.durationDiscountEnabled ?? false,
    spaceDiscount: params.spaceDiscount ?? null,
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
    spaceDiscountAmount:
      priceCalculation.spaceDiscount > 0
        ? priceCalculation.spaceDiscount
        : null,
  };
}

export function buildPayload(params: {
  reservationId: string;
  customer: {
    lastName: string;
    firstName: string;
    companyName: string | null;
    email: string;
  };
  space: {
    name: string;
    addressDetail: string | null;
    location: { address: string };
  };
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string | null | undefined;
  guestName?: string | null;
  icsSequence: number;
}): ReservationPayload {
  return {
    reservationId: params.reservationId,
    customerEmail: params.customer.email,
    customerName: `${params.customer.lastName} ${params.customer.firstName}`,
    companyName: params.customer.companyName,
    ...(params.guestName && { guestName: params.guestName }),
    spaceName: params.space.name,
    startTime: params.startTime,
    endTime: params.endTime,
    totalPrice: params.totalPrice,
    notes: params.notes ?? undefined,
    location: formatSpaceLineAddress(
      params.space.location.address,
      params.space.addressDetail,
    ),
    icsSequence: params.icsSequence,
  };
}
