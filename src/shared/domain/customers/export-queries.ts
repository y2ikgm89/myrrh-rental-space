import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function getCustomersForExport() {
  return prisma.customer.findMany({
    select: {
      id: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      companyName: true,
      email: true,
      phoneNumber: true,
      address: true,
      status: true,
      totalReservations: true,
      totalSpent: true,
      lastReservationAt: true,
      firstReservationAt: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
