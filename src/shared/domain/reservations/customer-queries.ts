import "server-only";

import { prisma } from "@/shared/db/prisma";

const CUSTOMER_RESERVATION_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  status: true,
  totalPrice: true,
  notes: true,
  createdAt: true,
  space: { select: { id: true, name: true, slug: true } },
} as const;

export async function getCustomerReservations(customerId: string) {
  return prisma.reservation.findMany({
    where: { customerId },
    select: CUSTOMER_RESERVATION_SELECT,
    orderBy: { startTime: "desc" },
  });
}

export async function getCustomerReservationDetail(
  reservationId: string,
  customerId: string,
) {
  return prisma.reservation.findFirst({
    where: { id: reservationId, customerId },
    select: {
      ...CUSTOMER_RESERVATION_SELECT,
      couponId: true,
      couponDiscountAmount: true,
      durationDiscountAmount: true,
      basePrice: true,
      spaceId: true,
    },
  });
}
