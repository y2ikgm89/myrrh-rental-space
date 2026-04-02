import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function getEventRegistrationsForExport(eventId: string) {
  return prisma.eventRegistration.findMany({
    where: { eventId, event: { deletedAt: null } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      note: true,
      numberOfPeople: true,
      status: true,
      cancelledAt: true,
      createdAt: true,
      event: {
        select: {
          title: true,
          startTime: true,
          endTime: true,
          location: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
