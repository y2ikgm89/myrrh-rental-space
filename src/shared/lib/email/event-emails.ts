/**
 * イベント関連メール
 *
 * イベント申込確認、キャンセル通知、管理者通知、イベント中止通知、イベント変更通知メールの送信。
 *
 * @module shared/lib/email/event-emails
 */

import "server-only";
import { EventRegistrationConfirmationEmail } from "@/shared/emails/event-registration-confirmation";
import { EventRegistrationCancelledEmail } from "@/shared/emails/event-registration-cancelled";
import { EventAdminNotificationEmail } from "@/shared/emails/event-admin-notification";
import { EventCancelledNotificationEmail } from "@/shared/emails/event-cancelled-notification";
import { EventUpdatedNotificationEmail } from "@/shared/emails/event-updated-notification";
import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";
import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { omitUndefined } from "../serialize";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "../errors/server";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
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
  numberOfPeople: number;
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

  const variables = omitUndefined({
    customerName: data.customerName,
    eventTitle: data.eventTitle,
    eventDate,
    startTime,
    endTime,
    location: data.location ?? "",
    numberOfPeople: String(data.numberOfPeople),
    registrationId: data.registrationId.slice(0, 8).toUpperCase(),
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.EVENT_REGISTRATION_CONFIRMATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: resolved.subject,
        react: EventRegistrationConfirmationEmail(
          omitUndefined({
            eventTitle: data.eventTitle,
            eventDate,
            startTime,
            endTime,
            location: data.location,
            numberOfPeople: data.numberOfPeople,
            registrationId: data.registrationId.slice(0, 8).toUpperCase(),
            greeting: resolved.greeting,
            intro: resolved.intro,
            outro: resolved.outro,
            preview: resolved.preview,
            companyName: resolved.companyName,
            footerNote: resolved.footerNote,
            supportContactText: resolved.supportContactText,
          }),
        ),
      }),
    {
      operation: "sendEventRegistrationConfirmation",
      registrationId: data.registrationId,
      customerEmail: data.customerEmail,
    },
  );
}

type EventRegistrationCancelledData = {
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventStartTime: Date;
};

/**
 * イベント申込キャンセル確認メールを送信
 */
export async function sendEventRegistrationCancelled(
  data: EventRegistrationCancelledData,
): Promise<EmailResult> {
  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  const variables = omitUndefined({
    customerName: data.customerName,
    eventTitle: data.eventTitle,
    eventDate,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.EVENT_REGISTRATION_CANCELLED,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: resolved.subject,
        react: EventRegistrationCancelledEmail(
          omitUndefined({
            eventTitle: data.eventTitle,
            eventDate,
            greeting: resolved.greeting,
            intro: resolved.intro,
            outro: resolved.outro,
            preview: resolved.preview,
            companyName: resolved.companyName,
            footerNote: resolved.footerNote,
            supportContactText: resolved.supportContactText,
          }),
        ),
      }),
    {
      operation: "sendEventRegistrationCancelled",
      customerEmail: data.customerEmail,
    },
  );
}

type EventAdminNotificationData = {
  participantName: string;
  participantEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  numberOfPeople: number;
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
  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { success: true };

  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  const variables = omitUndefined({
    participantName: data.participantName,
    participantEmail: data.participantEmail,
    eventTitle: data.eventTitle,
    eventDate,
    numberOfPeople: String(data.numberOfPeople),
    currentRegistrations: String(data.currentRegistrations),
    capacity: data.capacity != null ? String(data.capacity) : "",
    type,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.EVENT_ADMIN_NOTIFICATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: notificationEmails,
        subject: resolved.subject,
        react: EventAdminNotificationEmail(
          omitUndefined({
            type,
            participantEmail: data.participantEmail,
            eventTitle: data.eventTitle,
            eventDate,
            numberOfPeople: data.numberOfPeople,
            currentRegistrations: data.currentRegistrations,
            capacity: data.capacity,
            greeting: resolved.greeting,
            intro: resolved.intro,
            outro: resolved.outro,
            preview: resolved.preview,
            companyName: resolved.companyName,
            footerNote: resolved.footerNote,
            supportContactText: resolved.supportContactText,
          }),
        ),
      }),
    {
      operation: "sendEventAdminNotification",
      type,
    },
  );
}

/**
 * イベント中止時に全参加者へ通知メールを送信
 */
export async function sendEventCancelledToAllParticipants(
  eventId: string,
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      startTime: true,
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!event) return;

  const eventDate = format(event.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  // テンプレートは loop 前に1度だけ解決する（DB アクセス削減）
  const variables = omitUndefined({
    eventTitle: event.title,
    eventDate,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.EVENT_CANCELLED_NOTIFICATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return;
  }

  const results = await Promise.allSettled(
    event.registrations.map((registration) =>
      sendEmail(
        (resend, from) =>
          resend.emails.send({
            from,
            to: registration.email,
            subject: resolved.subject,
            react: EventCancelledNotificationEmail(
              omitUndefined({
                eventTitle: event.title,
                eventDate,
                greeting: resolved.greeting,
                intro: resolved.intro,
                outro: resolved.outro,
                preview: resolved.preview,
                companyName: resolved.companyName,
                footerNote: resolved.footerNote,
                supportContactText: resolved.supportContactText,
              }),
            ),
          }),
        {
          operation: "sendEventCancelledToAllParticipants",
          eventId,
          participantEmail: registration.email,
        },
      ),
    ),
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
 * イベント内容変更時に全参加者へ通知メールを送信
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
      location: true,
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!event) return;

  const oldEventDate = format(oldStartTime, "yyyy年M月d日 (EEEE) HH:mm", {
    locale: ja,
  });
  const newEventDate = format(event.startTime, "yyyy年M月d日 (EEEE) HH:mm", {
    locale: ja,
  });
  const newEndTime = format(event.endTime, "HH:mm", { locale: ja });
  const newEventDateRange = `${newEventDate}〜${newEndTime}`;

  // テンプレートは loop 前に1度だけ解決する（DB アクセス削減）
  const variables = omitUndefined({
    eventTitle: event.title,
    eventDate: oldEventDate,
    newEventDate: newEventDateRange,
    location: event.location ?? "",
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.EVENT_UPDATED_NOTIFICATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return;
  }

  const results = await Promise.allSettled(
    event.registrations.map((registration) =>
      sendEmail(
        (resend, from) =>
          resend.emails.send({
            from,
            to: registration.email,
            subject: resolved.subject,
            react: EventUpdatedNotificationEmail(
              omitUndefined({
                eventTitle: event.title,
                eventDate: oldEventDate,
                newEventDate: newEventDateRange,
                ...(event.location ? { location: event.location } : {}),
                greeting: resolved.greeting,
                intro: resolved.intro,
                outro: resolved.outro,
                preview: resolved.preview,
                companyName: resolved.companyName,
                footerNote: resolved.footerNote,
                supportContactText: resolved.supportContactText,
              }),
            ),
          }),
        {
          operation: "sendEventUpdatedToAllParticipants",
          eventId,
          participantEmail: registration.email,
        },
      ),
    ),
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
