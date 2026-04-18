import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { validateStatusTransition } from "./status";
import { CUSTOMER_SELECT, buildPayload } from "./payloads";

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

  const updated = await prisma.reservation.update({
    where: { id, deletedAt: null },
    data: {
      status,
      icsSequence: { increment: 1 },
      ...(isCancellation
        ? { cancelledAt: new Date(), cancelledByType: CANCELLED_BY.ADMIN }
        : {}),
    },
    select: { icsSequence: true },
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
      icsSequence: updated.icsSequence,
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
        icsSequence: { increment: 1 },
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
      data: {
        deletedAt: null,
        deletedById: null,
        icsSequence: { increment: 1 },
      },
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
