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
  await prisma.event.update({
    where: { id: params.eventId, deletedAt: null },
    data: { googleCalendarEventId: params.googleCalendarEventId },
  });
}

export async function clearEventGoogleCalendarEventId(
  eventId: string,
): Promise<void> {
  await prisma.event.update({
    where: { id: eventId, deletedAt: null },
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
      startTime: true,
      endTime: true,
      descriptionPlainText: true,
      addressDetail: true,
      googleCalendarEventId: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
    },
  });

  if (!event) return null;

  return {
    eventId: event.id,
    title: event.title,
    descriptionPlainText: event.descriptionPlainText,
    startTime: event.startTime,
    endTime: event.endTime,
    location: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    publicUrl: `${getAppUrl()}/events/${event.slug}`,
    googleCalendarEventId: event.googleCalendarEventId,
  };
}
