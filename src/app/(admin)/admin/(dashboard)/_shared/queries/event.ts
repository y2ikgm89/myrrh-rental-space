import "server-only";

import {
  getEvents as getEventsQuery,
  getEventById as getEventByIdQuery,
  getLocationsForEvent as getLocationsForEventQuery,
  getSpacesForEvent as getSpacesForEventQuery,
  getCategoriesForEvent as getCategoriesForEventQuery,
} from "@/shared/domain/events/admin-queries";
import type { GetEventsOptions } from "@/shared/domain/events/admin-queries";
import {
  getEventRegistrations as getEventRegistrationsQuery,
  getEventCheckInAttendees as getEventCheckInAttendeesQuery,
  getEventBroadcastRecipientCounts as getEventBroadcastRecipientCountsQuery,
} from "@/shared/domain/events/registration-queries";
import type { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  getWaitlistQueue as getWaitlistQueueQuery,
  getWaitlistQueueCount as getWaitlistQueueCountQuery,
} from "@/shared/domain/events/waitlist-queries";
import { requireAdminPermission } from "./_helpers";

export async function getEvents(options: GetEventsOptions = {}) {
  await requireAdminPermission("event", "read");
  return getEventsQuery(options);
}

export async function getEventById(id: string) {
  await requireAdminPermission("event", "read");
  return getEventByIdQuery(id);
}

export async function getLocationsForEvent() {
  await requireAdminPermission("event", "read");
  return getLocationsForEventQuery();
}

export async function getSpacesForEvent() {
  await requireAdminPermission("event", "read");
  return getSpacesForEventQuery();
}

export async function getCategoriesForEvent() {
  await requireAdminPermission("event", "read");
  return getCategoriesForEventQuery();
}

export async function getEventRegistrations(
  eventId: string,
  options: {
    page?: number;
    perPage?: number;
    search?: string;
    status?: RegistrationStatus;
  } = {},
) {
  await requireAdminPermission("event", "read");
  return getEventRegistrationsQuery(eventId, options);
}

export async function getEventCheckInAttendees(eventId: string) {
  await requireAdminPermission("event", "read");
  return getEventCheckInAttendeesQuery(eventId);
}

export async function getEventBroadcastRecipientCounts(
  eventId: string,
): Promise<{ eligible: number; skipped: number }> {
  await requireAdminPermission("event", "read");
  return getEventBroadcastRecipientCountsQuery(eventId);
}

export async function getWaitlistQueue(
  eventId: string,
  options: { page?: number; perPage?: number } = {},
) {
  await requireAdminPermission("event", "read");
  return getWaitlistQueueQuery(eventId, options);
}

export async function getWaitlistQueueCount(eventId: string): Promise<number> {
  await requireAdminPermission("event", "read");
  return getWaitlistQueueCountQuery(eventId);
}
