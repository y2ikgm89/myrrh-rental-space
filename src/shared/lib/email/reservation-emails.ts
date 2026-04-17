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
import { RESERVATION_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { sendEmail } from "./send";
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

  // カレンダー設定を取得
  const calendarSettings = await getCalendarEmailSettings();

  // カレンダーイベントを生成
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

  // Add to Calendarリンクを生成
  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? generateAddToCalendarLinks(calendarEvent)
    : undefined;

  // iCalファイルを生成（添付用）
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
      // 添付なしで続行
    }
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: `【ご予約確認】${data.spaceName} - ${reservationDate}`,
          react: ReservationConfirmationEmail(
            omitUndefined({
              customerName: data.customerName,
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              totalPrice: formatPrice(data.totalPrice, "未設定"),
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
              notes: data.notes,
              addToCalendarLinks,
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

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【予約キャンセル】${data.spaceName} - ${reservationDate}`,
        react: ReservationCancelledEmail({
          customerName: data.customerName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
        }),
      }),
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

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: `【予約ステータス更新】${data.spaceName} - ${reservationDate}`,
          react: ReservationStatusChangedEmail(
            omitUndefined({
              customerName: data.customerName,
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              totalPrice: formatPrice(data.totalPrice, "未設定"),
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
              newStatus: data.newStatus,
              location: data.location,
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

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: notificationEmails,
        subject: `【${actionText}】${data.spaceName} - ${data.customerName}様`,
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
          }),
        ),
      }),
    {
      operation: "sendReservationAdminNotification",
      reservationId: data.reservationId,
      action,
    },
  );
}
