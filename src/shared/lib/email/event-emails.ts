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
import { RegistrationStatus } from "@/shared/db/enums";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "../errors/server";
import { sendEmail } from "./send";
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

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【イベント申込確認】${data.eventTitle} - ${eventDate}`,
        react: EventRegistrationConfirmationEmail({
          customerName: data.customerName,
          eventTitle: data.eventTitle,
          eventDate,
          startTime,
          endTime,
          location: data.location,
          numberOfPeople: data.numberOfPeople,
          registrationId: data.registrationId.slice(0, 8).toUpperCase(),
        }),
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

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【イベント申込キャンセル】${data.eventTitle}`,
        react: EventRegistrationCancelledEmail({
          customerName: data.customerName,
          eventTitle: data.eventTitle,
          eventDate,
        }),
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

  const actionText =
    type === "registration" ? "新規イベント申込" : "イベント申込キャンセル";

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: notificationEmails,
        subject: `【${actionText}】${data.eventTitle} - ${data.participantName}様`,
        react: EventAdminNotificationEmail({
          type,
          participantName: data.participantName,
          participantEmail: data.participantEmail,
          eventTitle: data.eventTitle,
          eventDate,
          numberOfPeople: data.numberOfPeople,
          currentRegistrations: data.currentRegistrations,
          capacity: data.capacity,
        }),
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

  for (const registration of event.registrations) {
    try {
      await sendEmail(
        (resend, from) =>
          resend.emails.send({
            from,
            to: registration.email,
            subject: `【イベント中止のお知らせ】${event.title}`,
            react: EventCancelledNotificationEmail({
              customerName: registration.name,
              eventTitle: event.title,
              eventDate,
            }),
          }),
        {
          operation: "sendEventCancelledToAllParticipants",
          eventId,
          participantEmail: registration.email,
        },
      );
    } catch (error) {
      logError(normalizeError(error), {
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

  for (const registration of event.registrations) {
    try {
      await sendEmail(
        (resend, from) =>
          resend.emails.send({
            from,
            to: registration.email,
            subject: `【イベント内容変更のお知らせ】${event.title}`,
            react: EventUpdatedNotificationEmail({
              customerName: registration.name,
              eventTitle: event.title,
              eventDate: oldEventDate,
              newEventDate: `${newEventDate}〜${newEndTime}`,
              location: event.location ?? undefined,
            }),
          }),
        {
          operation: "sendEventUpdatedToAllParticipants",
          eventId,
          participantEmail: registration.email,
        },
      );
    } catch (error) {
      logError(normalizeError(error), {
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
