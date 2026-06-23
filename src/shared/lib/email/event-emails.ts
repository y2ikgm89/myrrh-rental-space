/**
 * イベント関連メール
 *
 * イベント申込確認、キャンセル通知、管理者通知、イベント中止通知、イベント変更通知メールの送信。
 *
 * @module shared/lib/email/event-emails
 */

import "server-only";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { EventAdminNotificationEmail } from "@/shared/emails/event-admin-notification";
import { EventCancelledNotificationEmail } from "@/shared/emails/event-cancelled-notification";
import { EventRegistrationCancelledEmail } from "@/shared/emails/event-registration-cancelled";
import { EventRegistrationConfirmationEmail } from "@/shared/emails/event-registration-confirmation";
import { EventUpdatedNotificationEmail } from "@/shared/emails/event-updated-notification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { prisma } from "@/shared/db/prisma";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
} from "@/shared/domain/settings/queries/notification";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import { formatEventVenue } from "@/shared/domain/events/venue";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import {
  buildAddToCalendarUrls,
  buildEventCalendar,
  buildEventCancelCalendar,
} from "../ical";
import { omitUndefined } from "../serialize";
import { getAdminUrl, getAppHost, getAppUrl } from "../constants";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult } from "./types";

// =============================================================================
// Event Registration Emails
// =============================================================================

type EventRegistrationConfirmationData = {
  registrationId: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: string | undefined;
  quantity: number;
  icsSequence: number;
};

/**
 * イベント申込確認メールを送信
 */
export async function sendEventRegistrationConfirmation(
  data: EventRegistrationConfirmationData,
): Promise<EmailResult> {
  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.eventStartTime, "HH:mm", { locale: ja });
  const endTime = format(data.eventEndTime, "HH:mm", { locale: ja });

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const appUrl = getAppUrl();
  const host = getAppHost();

  const calendarParams = omitUndefined({
    registrationId: data.registrationId,
    eventTitle: data.eventTitle,
    customerName: data.customerName,
    startTime: data.eventStartTime,
    endTime: data.eventEndTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    quantity: data.quantity,
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? buildAddToCalendarUrls({
        summary: data.eventTitle,
        description: [
          `申込ID: ${data.registrationId.slice(0, 8).toUpperCase()}`,
          `イベント: ${data.eventTitle}`,
          `日時: ${eventDate} ${startTime} - ${endTime}`,
        ].join("\n"),
        startTime: data.eventStartTime,
        endTime: data.eventEndTime,
        ...(data.location !== undefined ? { location: data.location } : {}),
        icsDownloadUrl: `${appUrl}/api/calendar/event/${data.registrationId}`,
      })
    : undefined;

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `event-${data.registrationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildEventCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateEventICalAttachment",
          registrationId: data.registrationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【イベント申込確認】${data.eventTitle} - ${eventDate}`,
      react: EventRegistrationConfirmationEmail(
        omitUndefined({
          customerName: data.customerName,
          eventTitle: data.eventTitle,
          eventDate,
          startTime,
          endTime,
          location: data.location,
          quantity: data.quantity,
          registrationId: data.registrationId.slice(0, 8).toUpperCase(),
          addToCalendarLinks,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `event-reg-confirm/${data.registrationId}`,
    operation: "sendEventRegistrationConfirmation",
    context: {
      registrationId: data.registrationId,
      customerEmail: data.customerEmail,
    },
  });
}

type EventRegistrationCancelledData = {
  registrationId: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: string | undefined;
  quantity: number;
  icsSequence: number;
};

/**
 * イベント申込キャンセル確認メールを送信（CANCEL ICS 添付）
 */
export async function sendEventRegistrationCancelled(
  data: EventRegistrationCancelledData,
): Promise<EmailResult> {
  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();

  const calendarParams = omitUndefined({
    registrationId: data.registrationId,
    eventTitle: data.eventTitle,
    customerName: data.customerName,
    startTime: data.eventStartTime,
    endTime: data.eventEndTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    quantity: data.quantity,
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `event-cancel-${data.registrationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildEventCancelCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateEventICalCancelAttachment",
          registrationId: data.registrationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【イベント申込キャンセル】${data.eventTitle}`,
      react: EventRegistrationCancelledEmail({
        customerName: data.customerName,
        eventTitle: data.eventTitle,
        eventDate,
        footer,
      }),
      attachments,
    }),
    idempotencyKey: `event-reg-cancel/${data.registrationId}`,
    operation: "sendEventRegistrationCancelled",
    context: {
      registrationId: data.registrationId,
      customerEmail: data.customerEmail,
    },
  });
}

type EventAdminNotificationData = {
  registrationId: string;
  eventId: string;
  participantName: string;
  participantEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  quantity: number;
  currentRegistrations: number;
  capacity: number | null;
};

/**
 * イベント申込に関する管理者通知メールを送信
 */
export async function sendEventAdminNotification(
  data: EventAdminNotificationData,
  type: "registration" | "cancellation",
): Promise<EmailResult> {
  const toggles = await getEmailDeliverySettings();
  const enabledByType =
    type === "registration"
      ? toggles.notifyEventRegistration
      : toggles.notifyEventCancellation;
  if (!enabledByType) return { ok: false, reason: "disabled" };

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();

  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  const actionText =
    type === "registration" ? "新規イベント申込" : "イベント申込キャンセル";

  return sendEmail({
    payload: {
      to: notificationEmails,
      subject: `【${actionText}】${data.eventTitle} - ${data.participantName}様`,
      react: EventAdminNotificationEmail({
        type,
        participantName: data.participantName,
        participantEmail: data.participantEmail,
        eventTitle: data.eventTitle,
        eventDate,
        quantity: data.quantity,
        currentRegistrations: data.currentRegistrations,
        capacity: data.capacity,
        adminUrl: getAdminUrl(`/events/${data.eventId}`),
        footer,
      }),
    },
    idempotencyKey: `event-admin/${data.registrationId}/${type}`,
    operation: "sendEventAdminNotification",
    context: {
      registrationId: data.registrationId,
      type,
    },
  });
}

/**
 * イベント中止時に全参加者へ通知メールを送信（CANCEL ICS 添付）
 */
export async function sendEventCancelledToAllParticipants(
  eventId: string,
  reason?: string,
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      startTime: true,
      endTime: true,
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
        },
      },
    },
  });

  if (!event) return;

  const venueDisplay = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });

  const eventDate = format(event.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();

  const results = await Promise.allSettled(
    event.registrations.map((registration) => {
      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (calendarSettings.icalAttachmentEnabled) {
        try {
          const calendarParams = omitUndefined({
            registrationId: registration.id,
            eventTitle: event.title,
            customerName: registration.name,
            startTime: event.startTime,
            endTime: event.endTime,
            ...(venueDisplay !== null ? { location: venueDisplay } : {}),
            quantity: registration.quantity,
            sequence: registration.icsSequence + 1,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
          });
          attachments = [
            {
              filename: `event-cancel-${registration.id.slice(0, 8)}.ics`,
              content: Buffer.from(
                buildEventCancelCalendar(calendarParams, host),
                "utf-8",
              ),
            },
          ];
        } catch {
          // ical generation failure is non-critical, continue without attachment
        }
      }

      return sendEmail({
        payload: omitUndefined({
          to: registration.email,
          subject: `【イベント中止のお知らせ】${event.title}`,
          react: EventCancelledNotificationEmail(
            omitUndefined({
              customerName: registration.name,
              eventTitle: event.title,
              eventDate,
              reason,
              footer,
            }),
          ),
          attachments,
        }),
        idempotencyKey: `event-cancelled/${eventId}/${hashForKey(registration.email)}`,
        operation: "sendEventCancelledToAllParticipants",
        context: {
          eventId,
          participantEmail: registration.email,
        },
      });
    }),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const registration = event.registrations[i];
      if (registration) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendEventCancelledToAllParticipants",
            eventId,
            participantEmail: registration.email,
          },
        });
      }
    }
  }
}

/**
 * イベント内容変更時に全参加者へ通知メールを送信（REQUEST ICS 添付）
 */
export async function sendEventUpdatedToAllParticipants(
  eventId: string,
  oldStartTime: Date,
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      startTime: true,
      endTime: true,
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
        },
      },
    },
  });

  if (!event) return;

  const venueDisplay = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });

  const oldEventDate = format(oldStartTime, "yyyy年M月d日 (EEEE) HH:mm", {
    locale: ja,
  });
  const newEventDate = format(event.startTime, "yyyy年M月d日 (EEEE) HH:mm", {
    locale: ja,
  });
  const newEndTime = format(event.endTime, "HH:mm", { locale: ja });
  const oldStartTimestamp = oldStartTime.getTime();

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();

  const results = await Promise.allSettled(
    event.registrations.map((registration) => {
      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (calendarSettings.icalAttachmentEnabled) {
        try {
          const calendarParams = omitUndefined({
            registrationId: registration.id,
            eventTitle: event.title,
            customerName: registration.name,
            startTime: event.startTime,
            endTime: event.endTime,
            ...(venueDisplay !== null ? { location: venueDisplay } : {}),
            quantity: registration.quantity,
            sequence: registration.icsSequence + 1,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
          });
          attachments = [
            {
              filename: `event-${registration.id.slice(0, 8)}.ics`,
              content: Buffer.from(
                buildEventCalendar(calendarParams, host),
                "utf-8",
              ),
            },
          ];
        } catch {
          // ical generation failure is non-critical, continue without attachment
        }
      }

      return sendEmail({
        payload: omitUndefined({
          to: registration.email,
          subject: `【イベント内容変更のお知らせ】${event.title}`,
          react: EventUpdatedNotificationEmail({
            customerName: registration.name,
            eventTitle: event.title,
            eventDate: oldEventDate,
            newEventDate: `${newEventDate}〜${newEndTime}`,
            location: venueDisplay ?? undefined,
            footer,
          }),
          attachments,
        }),
        idempotencyKey: `event-updated/${eventId}/${oldStartTimestamp}/${hashForKey(registration.email)}`,
        operation: "sendEventUpdatedToAllParticipants",
        context: {
          eventId,
          participantEmail: registration.email,
        },
      });
    }),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const registration = event.registrations[i];
      if (registration) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendEventUpdatedToAllParticipants",
            eventId,
            participantEmail: registration.email,
          },
        });
      }
    }
  }
}
