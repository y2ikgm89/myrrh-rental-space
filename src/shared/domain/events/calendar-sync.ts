import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants/urls";
import { formatEventVenue } from "@/shared/domain/events/venue";
import type { EventSyncData } from "@/shared/lib/calendar-sync/types";

export type EventSyncContext = EventSyncData & {
  googleCalendarEventId: string | null;
};

export async function saveEventGoogleCalendarEventId(params: {
  eventId: string;
  googleCalendarEventId: string;
}): Promise<void> {
  const firstSlot = await prisma.eventTimeSlot.findFirst({
    where: { eventId: params.eventId },
    orderBy: { startAt: "asc" },
    select: { id: true },
  });
  if (!firstSlot) return;
  await prisma.eventTimeSlot.update({
    where: { id: firstSlot.id },
    data: { googleCalendarEventId: params.googleCalendarEventId },
  });
}

export async function clearEventGoogleCalendarEventId(
  eventId: string,
): Promise<void> {
  const firstSlot = await prisma.eventTimeSlot.findFirst({
    where: { eventId },
    orderBy: { startAt: "asc" },
    select: { id: true },
  });
  if (!firstSlot) return;
  await prisma.eventTimeSlot.update({
    where: { id: firstSlot.id },
    data: { googleCalendarEventId: null },
  });
}

export async function markEventCalendarSyncError(params: {
  eventId: string;
  error: string;
}): Promise<void> {
  // Event モデルには calendarSyncError カラムがないため logError のみで記録
  logError(new Error(params.error), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "eventCalendarSync", eventId: params.eventId },
  });
}

export async function getEventForCalendarSync(
  eventId: string,
): Promise<EventSyncContext | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      descriptionPlainText: true,
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      slots: {
        select: { startAt: true, endAt: true, googleCalendarEventId: true },
        orderBy: { startAt: "asc" as const },
        take: 1,
      },
    },
  });

  if (!event) return null;

  const firstSlot = event.slots[0];
  return {
    eventId: event.id,
    title: event.title,
    descriptionPlainText: event.descriptionPlainText,
    startTime: firstSlot?.startAt ?? new Date(0),
    endTime: firstSlot?.endAt ?? new Date(0),
    location: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    publicUrl: `${getAppUrl()}/events/${event.slug}`,
    googleCalendarEventId: firstSlot?.googleCalendarEventId ?? null,
  };
}
