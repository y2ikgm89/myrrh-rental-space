import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus, TermsStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  CANCELLED_BY,
  CREATABLE_RESERVATION_STATUSES,
  RESERVATION_STATUS_TRANSITIONS,
} from "@/shared/lib/validations/enums/helpers";
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

export type { ReservationPayload } from "./payloads";

export function validateStatusTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): void {
  if (from === to) return;
  const allowed = RESERVATION_STATUS_TRANSITIONS[from];
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
        notes:
          input.manualDiscountAmount && input.manualDiscountReason
            ? `${input.notes || ""}\n【手動割引】¥${input.manualDiscountAmount.toLocaleString()} - ${input.manualDiscountReason}`.trim()
            : input.notes || null,
        status: input.status,
        // Guest contact info (管理者入力の場合は customerData から記録)
        ...(input.customerData && {
          guestLastName: input.customerData.lastName,
          guestFirstName: input.customerData.firstName,
          guestPhone: input.customerData.phoneNumber || null,
          guestCompanyName: input.customerData.companyName || null,
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
    customerId: input.customerId,
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
    where: { id, deletedAt: null },
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

  const isCancellation =
    status === ReservationStatus.CANCELLED &&
    previousStatus !== ReservationStatus.CANCELLED;

  await prisma.reservation.update({
    where: { id, deletedAt: null },
    data: {
      status,
      ...(isCancellation
        ? { cancelledAt: new Date(), cancelledByType: CANCELLED_BY.ADMIN }
        : {}),
    },
  });

  return {
    previousStatus,
    googleCalendarEventId: reservation.googleCalendarEventId,
    customerId: reservation.customerId,
    couponId: reservation.couponId,
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
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  await prisma.reservation.update({
    where: { id, deletedAt: null },
    data: { notes },
  });
}

// ---------------------------------------------------------------------------
// Admin: Delete
// ---------------------------------------------------------------------------

export async function deleteReservationCommand(
  id: string,
  userId: string | undefined,
  cancellationReason?: string | null,
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      googleCalendarEventId: true,
      couponId: true,
      customerId: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  const now = new Date();
  const needsCancellationTracking =
    reservation.status !== ReservationStatus.CANCELLED &&
    reservation.status !== ReservationStatus.COMPLETED &&
    reservation.status !== ReservationStatus.NO_SHOW;

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id, deletedAt: null },
      data: {
        deletedAt: now,
        deletedById: userId ?? null,
        ...(needsCancellationTracking
          ? {
              status: ReservationStatus.CANCELLED,
              cancelledAt: now,
              cancelledByType: CANCELLED_BY.ADMIN,
              cancellationReason: cancellationReason ?? "管理者による削除",
            }
          : {}),
      },
    });

    if (reservation.couponId) {
      await tx.coupon.updateMany({
        where: { id: reservation.couponId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
  });

  return {
    googleCalendarEventId: reservation.googleCalendarEventId,
    customerId: reservation.customerId,
    couponId: reservation.couponId,
  };
}

export async function restoreReservationCommand(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      couponId: true,
      customerId: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (!reservation.deletedAt) {
    throw new DomainError("この予約は削除されていません");
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });

    if (reservation.couponId) {
      await tx.coupon.update({
        where: { id: reservation.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }
  });

  return {
    customerId: reservation.customerId,
    couponId: reservation.couponId,
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
  companyName?: string | null | undefined;
  notes?: string | null | undefined;
  userId?: string | null | undefined;
  agreedTermsIds?: string[] | undefined;
  clientIp?: string | null | undefined;
  userAgent?: string | null | undefined;
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

    // Validate all required terms are agreed to
    const requiredGlobalTerms = await tx.terms.findMany({
      where: {
        requiredAtReservation: true,
        isActive: true,
        versions: {
          some: { isCurrentVersion: true, status: TermsStatus.PUBLISHED },
        },
      },
      select: { id: true },
    });

    const allRequiredIds = new Set(requiredGlobalTerms.map((t) => t.id));

    // Add space-specific terms
    const spaceWithTerms = await tx.space.findUnique({
      where: { id: input.spaceId },
      select: { termsId: true },
    });
    if (spaceWithTerms?.termsId) {
      allRequiredIds.add(spaceWithTerms.termsId);
    }

    // Verify all required terms are in agreedTermsIds
    if (allRequiredIds.size > 0) {
      const agreedSet = new Set(input.agreedTermsIds);
      for (const requiredId of allRequiredIds) {
        if (!agreedSet.has(requiredId)) {
          throw new DomainError("必須の規約に同意してください", "VALIDATION");
        }
      }
    }

    const customerId = await resolveOrCreateCustomer(
      {
        lastName: input.lastName,
        firstName: input.firstName,
        email: input.email,
        phoneNumber: input.phoneNumber,
        companyName: input.companyName,
        userId: input.userId,
      },
      tx,
    );

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
        userId: input.userId || null,
        // Guest contact info (予約時の入力を記録)
        guestLastName: input.lastName,
        guestFirstName: input.firstName,
        guestPhone: input.phoneNumber || null,
        guestCompanyName: input.companyName || null,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    await incrementCustomerReservationStats(tx, customerId);

    // Create TermsAgreement records for agreed terms
    const agreedTermsIds = input.agreedTermsIds;
    if (agreedTermsIds && agreedTermsIds.length > 0) {
      const termsWithVersions = await tx.terms.findMany({
        where: {
          id: { in: agreedTermsIds },
          isActive: true,
        },
        select: {
          id: true,
          versions: {
            where: {
              isCurrentVersion: true,
              status: TermsStatus.PUBLISHED,
            },
            take: 1,
            select: { id: true },
          },
        },
      });

      const agreementData: Array<{
        termsId: string;
        versionId: string;
        reservationId: string;
        userId: string | null;
        ipAddress: string | null;
        userAgent: string | null;
      }> = [];
      for (const t of termsWithVersions) {
        const version = t.versions[0];
        if (!version) continue;
        agreementData.push({
          termsId: t.id,
          versionId: version.id,
          reservationId: created.id,
          userId: input.userId || null,
          ipAddress: input.clientIp || null,
          userAgent: input.userAgent || null,
        });
      }

      if (agreementData.length > 0) {
        await tx.termsAgreement.createMany({ data: agreementData });
      }
    }

    return created;
  });

  // Compute guest name diff for admin notification
  const guestFullName = `${input.lastName} ${input.firstName}`.trim();
  const customerFullName =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFullName !== customerFullName ? guestFullName : null;

  return {
    id: reservation.id,
    customerId: reservation.customerId,
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: basePrice,
      notes: input.notes,
      guestName: guestNameDiff,
    }),
  };
}
