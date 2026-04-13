import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function getReservationsForExport() {
  return prisma.reservation.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      paymentStatus: true,
      totalPrice: true,
      basePrice: true,
      couponDiscountAmount: true,
      durationDiscountAmount: true,
      spaceDiscountAmount: true,
      notes: true,
      createdAt: true,
      guestLastName: true,
      guestFirstName: true,
      guestPhone: true,
      guestCompanyName: true,
      space: { select: { name: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          email: true,
          phoneNumber: true,
          companyName: true,
        },
      },
      coupon: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
