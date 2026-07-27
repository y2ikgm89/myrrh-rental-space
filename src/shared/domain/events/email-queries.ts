import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatEventVenue } from "@/shared/domain/events/venue";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import type {
  EventBroadcastPayload,
  EventCancelledNotificationPayload,
  EventUpdatedNotificationPayload,
} from "@/shared/lib/email/types";

export type {
  EventBroadcastPayload,
  EventCancelledNotificationPayload,
  EventUpdatedNotificationPayload,
} from "@/shared/lib/email/types";

/**
 * イベント中止通知メール (`sendEventCancelledToAllParticipants`) 用 payload。
 */
export async function getEventCancelledNotificationPayload(
  eventId: string,
): Promise<EventCancelledNotificationPayload | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      format: true,
      meetingUrl: true,
      updatedAt: true,
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      registrations: {
        where: {
          status: {
            in: [
              RegistrationStatus.CONFIRMED,
              RegistrationStatus.WAITLISTED_OFFERED,
              RegistrationStatus.WAITLISTED,
            ],
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
          customerId: true,
          status: true,
          slot: {
            select: { startAt: true, endAt: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  return {
    eventId,
    title: event.title,
    format: event.format,
    meetingUrl: event.meetingUrl,
    updatedAt: event.updatedAt,
    venueDisplay: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    registrations: event.registrations,
  };
}

/**
 * イベント内容変更通知メール (`sendEventUpdatedToAllParticipants`) 用 payload。
 */
export async function getEventUpdatedNotificationPayload(
  eventId: string,
): Promise<EventUpdatedNotificationPayload | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      format: true,
      meetingUrl: true,
      updatedAt: true,
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          id: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
          slotId: true,
          customerId: true,
          slot: {
            select: { startAt: true, endAt: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  return {
    eventId,
    title: event.title,
    format: event.format,
    meetingUrl: event.meetingUrl,
    updatedAt: event.updatedAt,
    venueDisplay: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    registrations: event.registrations,
  };
}

/**
 * 管理者オーサリング型 event broadcast (`sendEventBroadcast`) 用 payload。
 */
export async function getEventBroadcastPayload(
  eventId: string,
): Promise<EventBroadcastPayload | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      slug: true,
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          id: true,
          email: true,
          customerId: true,
        },
      },
    },
  });

  if (!event) return null;

  const totalRegistrations = event.registrations.length;
  const recipients = event.registrations.filter(
    (r): r is typeof r & { email: string } => r.email !== null,
  );
  const skipped = totalRegistrations - recipients.length;

  const unresolvedEmails = [
    ...new Set(
      recipients
        .filter((r) => r.customerId === null)
        .map((r) => normalizeEmailForIdentity(r.email)),
    ),
  ];
  const customersByEmail =
    unresolvedEmails.length > 0
      ? await prisma.customer.findMany({
          where: { emailCanonical: { in: unresolvedEmails } },
          select: { id: true, emailCanonical: true },
        })
      : [];
  const customerIdByEmail = new Map(
    customersByEmail.map((c) => [c.emailCanonical, c.id]),
  );

  return {
    eventId,
    title: event.title,
    slug: event.slug,
    recipients,
    skipped,
    customerIdByEmail,
  };
}
