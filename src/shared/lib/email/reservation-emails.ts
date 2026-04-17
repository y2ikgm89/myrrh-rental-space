/**
 * 予約関連メール
 *
 * 予約確認、キャンセル通知、管理者通知メールの送信。
 *
 * @module shared/lib/email/reservation-emails
 */

import "server-only";
import { formatPrice } from "@/shared/lib/pricing/format";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { ReservationCancelledEmail } from "@/shared/emails/reservation-cancelled";
import { ReservationStatusChangedEmail } from "@/shared/emails/reservation-status-changed";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import {
  getCalendarEmailSettings,
  getNotificationEmailAddresses,
} from "@/shared/domain/settings/queries/notification";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  createReservationEvent,
  generateAddToCalendarLinks,
  generateICalContent,
} from "@/shared/lib/ical";
import { getAdminUrl } from "../constants";
import { omitUndefined } from "../serialize";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "../errors/server";
import { RESERVATION_ACTION_LABELS, EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type {
  ReservationEmailData,
  StatusChangeEmailData,
  EmailResult,
} from "./types";

// =============================================================================
// Reservation Emails
// =============================================================================

/**
 * 予約確認メールを送信
 */
export async function sendReservationConfirmationEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const variables = omitUndefined({
    customerName: data.customerName,
    spaceName: data.spaceName,
    reservationDate,
    startTime,
    endTime,
    totalPrice: formatPrice(data.totalPrice, "未設定"),
    reservationId: data.reservationId.slice(0, 8).toUpperCase(),
    notes: data.notes ?? "",
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  const calendarSettings = await getCalendarEmailSettings();
  const calendarEvent = createReservationEvent(
    omitUndefined({
      reservationId: data.reservationId,
      spaceName: data.spaceName,
      customerName: data.customerName,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      notes: data.notes,
    }),
  );

  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? generateAddToCalendarLinks(calendarEvent)
    : undefined;

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(generateICalContent(calendarEvent), "utf-8"),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: resolved.subject,
          react: ReservationConfirmationEmail(
            omitUndefined({
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              totalPrice: formatPrice(data.totalPrice, "未設定"),
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
              notes: data.notes,
              addToCalendarLinks,
              greeting: resolved.greeting,
              intro: resolved.intro,
              outro: resolved.outro,
              preview: resolved.preview,
              companyName: resolved.companyName,
              footerNote: resolved.footerNote,
              supportContactText: resolved.supportContactText,
            }),
          ),
          attachments,
        }),
      ),
    {
      operation: "sendReservationConfirmationEmail",
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  );
}

/**
 * 予約キャンセルメールを送信
 */
export async function sendReservationCancelledEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const variables = omitUndefined({
    customerName: data.customerName,
    spaceName: data.spaceName,
    reservationDate,
    startTime,
    endTime,
    reservationId: data.reservationId.slice(0, 8).toUpperCase(),
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.RESERVATION_CANCELLED,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: resolved.subject,
          react: ReservationCancelledEmail(
            omitUndefined({
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
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
      ),
    {
      operation: "sendReservationCancelledEmail",
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  );
}

/**
 * 予約ステータス変更通知メールを送信
 */
export async function sendReservationStatusChangedEmail(
  data: StatusChangeEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const variables = omitUndefined({
    customerName: data.customerName,
    spaceName: data.spaceName,
    reservationDate,
    startTime,
    endTime,
    totalPrice: formatPrice(data.totalPrice, "未設定"),
    reservationId: data.reservationId.slice(0, 8).toUpperCase(),
    newStatus: data.newStatus,
    oldStatus: data.oldStatus,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.RESERVATION_STATUS_CHANGED,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: resolved.subject,
          react: ReservationStatusChangedEmail(
            omitUndefined({
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              totalPrice: formatPrice(data.totalPrice, "未設定"),
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
              newStatus: data.newStatus,
              location: data.location,
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
      ),
    {
      operation: "sendReservationStatusChangedEmail",
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  );
}

/**
 * 予約に関する管理者通知メールを送信
 */
export async function sendReservationAdminNotification(
  data: ReservationEmailData,
  action: "new" | "update" | "cancel",
): Promise<EmailResult> {
  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { success: true };

  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const actionText = RESERVATION_ACTION_LABELS[action];

  const variables = omitUndefined({
    action,
    actionText,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    spaceName: data.spaceName,
    reservationDate,
    startTime,
    endTime,
    totalPrice: formatPrice(data.totalPrice, "未設定"),
    reservationId: data.reservationId.slice(0, 8).toUpperCase(),
    guestName: data.guestName ?? "",
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.ADMIN_NOTIFICATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: notificationEmails,
          subject: resolved.subject,
          react: AdminNotificationEmail(
            omitUndefined({
              type: "reservation" as const,
              action,
              customerName: data.customerName,
              customerEmail: data.customerEmail,
              guestName: data.guestName,
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              totalPrice: formatPrice(data.totalPrice, "未設定"),
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
              adminUrl: getAdminUrl(`/reservations/${data.reservationId}`),
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
      ),
    {
      operation: "sendReservationAdminNotification",
      reservationId: data.reservationId,
      action,
    },
  );
}
