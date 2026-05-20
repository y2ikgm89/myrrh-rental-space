import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@generated/prisma/enums";
import { formatEventVenue } from "@/shared/domain/events/venue";

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
      quantity: true,
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
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export async function getEventDetailsForEmail(eventId: string): Promise<{
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location: string | null;
  readonly capacity: number | null;
  readonly confirmedCount: number;
} | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      startTime: true,
      endTime: true,
      addressDetail: true,
      capacity: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      _count: {
        select: {
          registrations: {
            where: { status: RegistrationStatus.CONFIRMED },
          },
        },
      },
    },
  });
  if (!event) return null;
  return {
    startTime: event.startTime,
    endTime: event.endTime,
    location: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    capacity: event.capacity,
    confirmedCount: event._count.registrations,
  };
}

export async function getCustomerEventRegistrations(customerId: string) {
  const rows = await prisma.eventRegistration.findMany({
    where: { customerId, event: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      quantity: true,
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
          addressDetail: true,
          status: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    quantity: row.quantity,
    status: row.status,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    event: {
      id: row.event.id,
      title: row.event.title,
      slug: row.event.slug,
      startTime: row.event.startTime,
      endTime: row.event.endTime,
      status: row.event.status,
      location: formatEventVenue({
        location: row.event.location,
        space: row.event.space,
        addressDetail: row.event.addressDetail,
      }),
    },
  }));
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
  quantity: number;
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
      quantity: true,
      icsSequence: true,
      status: true,
      event: {
        select: {
          title: true,
          startTime: true,
          endTime: true,
          addressDetail: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
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
    location: formatEventVenue({
      location: reg.event.location,
      space: reg.event.space,
      addressDetail: reg.event.addressDetail,
    }),
    quantity: reg.quantity,
    icsSequence: reg.icsSequence,
    status: reg.status,
  };
}
