import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatEventVenue } from "@/shared/domain/events/venue";

export async function getEventRegistrationsForExport(eventId: string) {
  const rows = await prisma.eventRegistration.findMany({
    where: { eventId, event: { deletedAt: null } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      note: true,
      quantity: true,
      status: true,
      cancelledAt: true,
      attendedAt: true,
      createdAt: true,
      event: {
        select: {
          title: true,
          addressDetail: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
      slot: {
        select: { startAt: true, endAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    ...row,
    event: {
      title: row.event.title,
      startTime: row.slot.startAt,
      endTime: row.slot.endAt,
      location: formatEventVenue({
        location: row.event.location,
        space: row.event.space,
        addressDetail: row.event.addressDetail,
      }),
    },
  }));
}
