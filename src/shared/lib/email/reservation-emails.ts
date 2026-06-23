/**
 * 予約関連メール
 *
 * 予約確認、キャンセル通知、管理者通知メールの送信。
 *
 * @module shared/lib/email/reservation-emails
 */

import "server-only";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import { ReservationCancelledEmail } from "@/shared/emails/reservation-cancelled";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { ReservationStatusChangedEmail } from "@/shared/emails/reservation-status-changed";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
} from "@/shared/domain/settings/queries/notification";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { createCancelToken } from "@/shared/lib/reservation-cancel-token";
import { formatPrice } from "@/shared/lib/pricing/format";
import { RESERVATION_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { getAdminUrl, getAppHost, getAppUrl } from "../constants";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import {
  buildAddToCalendarUrls,
  buildReservationCalendar,
  buildReservationCancelCalendar,
} from "../ical";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import type {
  EmailResult,
  ReservationEmailData,
  StatusChangeEmailData,
} from "./types";

/**
 * 予約 ID から、会員向けマイページの予約詳細 URL を組み立てる。
 * userId が無い（ゲスト予約）場合は undefined を返す。
 */
function buildMemberReservationUrl(
  userId: string | null | undefined,
  reservationId: string,
): string | undefined {
  if (!userId) return undefined;
  return `${getAppUrl()}/mypage/reservations/${reservationId}`;
}

/**
 * 予約確認メールを送信
 */
export async function sendReservationConfirmationEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const { sendReservationConfirmationEmail: enabled } =
    await getEmailDeliverySettings();
  if (!enabled) return { ok: false, reason: "disabled" };

  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const [calendarSettings, deadlineSettings, organizer, footer] =
    await Promise.all([
      getCalendarEmailSettings(),
      getReservationDeadlineSettings(),
      getIcalOrganizer(),
      getEmailFooterData(),
    ]);
  const appUrl = getAppUrl();
  const host = getAppHost();

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? buildAddToCalendarUrls({
        summary: `【予約】${data.spaceName}`,
        description: [
          `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
          `スペース: ${data.spaceName}`,
          `日時: ${reservationDate} ${startTime} - ${endTime}`,
        ].join("\n"),
        startTime: data.startTime,
        endTime: data.endTime,
        ...(data.location !== undefined ? { location: data.location } : {}),
        icsDownloadUrl: `${appUrl}/api/calendar/reservation/${data.reservationId}`,
      })
    : undefined;

  // 期限内のみ有効なキャンセルトークン URL を発行。
  // 会員でも非会員でも cancelUrl は発行する（マイページが落ちている時の保険として）。
  const cancelDeadline = new Date(
    data.startTime.getTime() -
      deadlineSettings.cancellationDeadlineHours * 60 * 60 * 1000,
  );
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/reservation/cancel?token=${createCancelToken(data.reservationId, cancelDeadline)}`
      : undefined;

  const memberReservationUrl = buildMemberReservationUrl(
    data.userId,
    data.reservationId,
  );

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildReservationCalendar(calendarParams, host),
            "utf-8",
          ),
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

  return sendEmail({
    payload: omitUndefined({
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
          cancelUrl,
          memberReservationUrl,
          cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `reservation-confirm/${data.reservationId}`,
    operation: "sendReservationConfirmationEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約キャンセルメールを送信（CANCEL ICS 添付）
 */
export async function sendReservationCancelledEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-cancel-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildReservationCancelCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalCancelAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【予約キャンセル】${data.spaceName} - ${reservationDate}`,
      react: ReservationCancelledEmail({
        customerName: data.customerName,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
        footer,
      }),
      attachments,
    }),
    idempotencyKey: `reservation-cancel/${data.reservationId}`,
    operation: "sendReservationCancelledEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約ステータス変更通知メールを送信
 * CANCELLED の場合は CANCEL ICS を添付、それ以外は REQUEST ICS を添付
 */
export async function sendReservationStatusChangedEmail(
  data: StatusChangeEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const appUrl = getAppUrl();
  const host = getAppHost();

  const isCancelled = data.newStatus === ReservationStatus.CANCELLED;

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  const addToCalendarLinks =
    !isCancelled && calendarSettings.addToCalendarLinksEnabled
      ? buildAddToCalendarUrls({
          summary: `【予約】${data.spaceName}`,
          description: [
            `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
            `スペース: ${data.spaceName}`,
            `日時: ${reservationDate} ${startTime} - ${endTime}`,
          ].join("\n"),
          startTime: data.startTime,
          endTime: data.endTime,
          ...(data.location !== undefined ? { location: data.location } : {}),
          icsDownloadUrl: `${appUrl}/api/calendar/reservation/${data.reservationId}`,
        })
      : undefined;

  const memberReservationUrl = buildMemberReservationUrl(
    data.userId,
    data.reservationId,
  );

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      const icsContent = isCancelled
        ? buildReservationCancelCalendar(calendarParams, host)
        : buildReservationCalendar(calendarParams, host);
      const filePrefix = isCancelled ? "reservation-cancel-" : "reservation-";
      attachments = [
        {
          filename: `${filePrefix}${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(icsContent, "utf-8"),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalStatusChangeAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
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
          addToCalendarLinks,
          memberReservationUrl,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `reservation-status/${data.reservationId}/${data.newStatus}`,
    operation: "sendReservationStatusChangedEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約に関する管理者通知メールを送信
 */
export async function sendReservationAdminNotification(
  data: ReservationEmailData,
  action: "new" | "update" | "cancel",
): Promise<EmailResult> {
  const toggles = await getEmailDeliverySettings();
  const enabledByAction = {
    new: toggles.notifyNewReservation,
    update: toggles.notifyReservationChange,
    cancel: toggles.notifyReservationCancel,
  }[action];
  if (!enabledByAction) return { ok: false, reason: "disabled" };

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();

  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const actionText = RESERVATION_ACTION_LABELS[action];

  return sendEmail({
    payload: {
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
          footer,
        }),
      ),
    },
    idempotencyKey: `reservation-admin/${data.reservationId}/${action}`,
    operation: "sendReservationAdminNotification",
    context: {
      reservationId: data.reservationId,
      action,
    },
  });
}
