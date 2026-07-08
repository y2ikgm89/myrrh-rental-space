import "server-only";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { getCalendarEmailSettings } from "@/shared/domain/settings/queries/notification";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import {
  computeCancelTokenExpiresAt,
  createCancelToken,
} from "@/shared/lib/reservation-cancel-token";
import { getAppHost, getAppUrl } from "../constants";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import { buildReservationCalendar } from "../ical";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import type { EmailResult, ReminderEmailData } from "./types";

export async function sendReservationReminderEmail(
  data: ReminderEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日", {
    locale: ja,
  });

  const [calendarSettings, deadlineSettings, organizer, footer] =
    await Promise.all([
      getCalendarEmailSettings(),
      getReservationDeadlineSettings(),
      getIcalOrganizer(),
      getEmailFooterData(),
    ]);
  const host = getAppHost();
  const appUrl = getAppUrl();

  // リマインダ送信時点でキャンセル期限内なら、キャンセル URL を生成する。
  // 「リマインダにキャンセル URL が無い」と顧客が連絡無くキャンセルし得る運用上の穴を塞ぐ。
  // 漏洩窓上限（MAX_CANCEL_TOKEN_LIFETIME_MS）を掛けるが、リマインダは予約直前に送るため
  // 通常は policy 期限の方が早く採用される（cap は実質効かない）。
  const cancelDeadline = computeCancelTokenExpiresAt(
    data.startTime,
    deadlineSettings.cancellationDeadlineHours,
  );
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/reservation/cancel?token=${createCancelToken(data.reservationId, cancelDeadline)}`
      : undefined;

  const memberReservationUrl = data.userId
    ? `${appUrl}/mypage/reservations/${data.reservationId}`
    : undefined;

  // ゲスト予約のみ、マイページに予約を追加する claim リンクを発行する（会員は不要）。
  const claimUrl = data.userId
    ? undefined
    : `${appUrl}/claim/reservation?token=${createReservationClaimToken(data.reservationId)}`;

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
          operation: "generateICalReminderAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【ご予約リマインダー】${data.spaceName} - ${reservationDate}`,
      react: ReservationReminderEmail(
        omitUndefined({
          customerName: data.customerName,
          spaceName: data.spaceName,
          startTime: data.startTime,
          endTime: data.endTime,
          location: data.location,
          notes: data.notes,
          cancelUrl,
          memberReservationUrl,
          claimUrl,
          cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `reservation-reminder/${data.reservationId}`,
    operation: "sendReservationReminderEmail",
    context: {
      reservationId: data.reservationId,
      email: data.customerEmail,
    },
  });
}
