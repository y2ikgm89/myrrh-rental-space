import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/db/enums";

export async function getEventRegistrations(eventId: string) {
  return prisma.eventRegistration.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
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
    },
  });
}

export async function getRegistrationCount(eventId: string) {
  const result = await prisma.eventRegistration.aggregate({
    where: { eventId, status: RegistrationStatus.CONFIRMED },
    _sum: { numberOfPeople: true },
  });
  return result._sum.numberOfPeople ?? 0;
}

export async function getEventDetailsForEmail(eventId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      startTime: true,
      endTime: true,
      location: true,
      capacity: true,
      _count: {
        select: {
          registrations: {
            where: { status: RegistrationStatus.CONFIRMED },
          },
        },
      },
    },
  });
}

export async function getCustomerEventRegistrations(customerId: string) {
  return prisma.eventRegistration.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      numberOfPeople: true,
      status: true,
      cancelledAt: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startTime: true,
          endTime: true,
          location: true,
          status: true,
        },
      },
    },
  });
}
