import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@generated/prisma/enums";

export async function getEventRegistrations(eventId: string) {
  return prisma.eventRegistration.findMany({
    where: { eventId, event: { deletedAt: null } },
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

export async function getEventIdsByCustomerId(
  customerId: string,
): Promise<string[]> {
  const rows = await prisma.eventRegistration.findMany({
    where: { customerId },
    select: { eventId: true },
    distinct: ["eventId"],
  });
  return rows.map((row) => row.eventId);
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
    where: { customerId, event: { deletedAt: null } },
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

export async function getEventRegistrationForCalendar(params: {
  registrationId: string;
  customerId: string;
}): Promise<{
  id: string;
  eventTitle: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
  numberOfPeople: number;
  icsSequence: number;
  status: RegistrationStatus;
} | null> {
  const reg = await prisma.eventRegistration.findFirst({
    where: {
      id: params.registrationId,
      customerId: params.customerId,
      event: { deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      numberOfPeople: true,
      icsSequence: true,
      status: true,
      event: {
        select: {
          title: true,
          startTime: true,
          endTime: true,
          location: true,
        },
      },
    },
  });
  if (!reg) return null;
  return {
    id: reg.id,
    eventTitle: reg.event.title,
    customerName: reg.name,
    startTime: reg.event.startTime,
    endTime: reg.event.endTime,
    location: reg.event.location,
    numberOfPeople: reg.numberOfPeople,
    icsSequence: reg.icsSequence,
    status: reg.status,
  };
}
