import "server-only";
import { formatDateWithWeekday } from "@/shared/lib/date-format";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { buildBookingHubUrl } from "@/shared/lib/detail-hub-urls";
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
import type {
  EmailResult,
  EmailSendContext,
  ReminderEmailData,
  ReminderEmailRenderContext,
} from "./types";

export async function sendReservationReminderEmail(
  data: ReminderEmailData,
  renderContext: ReminderEmailRenderContext,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const reservationDate = formatDateWithWeekday(data.startTime);

  const { calendarSettings, deadlineSettings, organizer } = renderContext;
  const footer = await getEmailFooterData();
  const host = getAppHost();
  const appUrl = getAppUrl();

  const cancelDeadline = computeCancelTokenExpiresAt(
    data.startTime,
    deadlineSettings.cancellationDeadlineHours,
  );
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/reservation/cancel?token=${createCancelToken(data.reservationId, cancelDeadline)}`
      : undefined;

  const bookingHubUrl = buildBookingHubUrl(data.userId, data.reservationId);

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

  return sendEmail(
    {
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
            bookingHubUrl,
            claimUrl,
            cancellationDeadlineHours:
              deadlineSettings.cancellationDeadlineHours,
            footer,
          }),
        ),
        attachments,
      }),
      idempotencyKey: `reservation-reminder/${data.reservationId}/${data.reminderWindowDate}`,
      operation: "sendReservationReminderEmail",
      context: {
        reservationId: data.reservationId,
        email: data.customerEmail,
      },
    },
    sendContext,
  );
}
