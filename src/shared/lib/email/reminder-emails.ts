import "server-only";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { getCalendarEmailSettings } from "@/shared/domain/settings/queries/notification";
import { SITE_DEFAULTS, getAppHost } from "../constants";
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

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendReservationReminderEmail(
  data: ReminderEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();
  const reservationDate = format(data.startTime, "yyyy年M月d日", {
    locale: ja,
  });

  const calendarSettings = await getCalendarEmailSettings();
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
      react: ReservationReminderEmail({
        customerName: data.customerName,
        spaceName: data.spaceName,
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location,
        notes: data.notes,
        siteName,
      }),
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
