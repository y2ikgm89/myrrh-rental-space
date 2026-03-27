import "server-only";

import { PaymentStatus } from "@/shared/db/enums";
import { prisma } from "@/shared/db/prisma";

export async function updateReservationPaymentCompleted(
  reservationId: string,
  data: {
    stripePaymentIntentId: string | null;
  },
) {
  return prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      totalPrice: true,
      notes: true,
      customer: {
        select: {
          email: true,
          lastName: true,
          firstName: true,
        },
      },
      space: {
        select: {
          name: true,
          location: {
            select: { name: true },
          },
        },
      },
    },
  });
}

export async function markReservationPaymentFailed(reservationId: string) {
  return prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: { paymentStatus: PaymentStatus.FAILED },
  });
}

export async function findReservationByPaymentIntent(paymentIntentId: string) {
  return prisma.reservation.findFirst({
    where: {
      stripePaymentIntentId: paymentIntentId,
      deletedAt: null,
    },
    select: { id: true },
  });
}

export async function markReservationRefunded(reservationId: string) {
  return prisma.reservation.update({
    where: { id: reservationId },
    data: { paymentStatus: PaymentStatus.REFUNDED },
  });
}
