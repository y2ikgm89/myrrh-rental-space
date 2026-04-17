import "server-only";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
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

  return sendEmail({
    payload: {
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
    },
    idempotencyKey: `reservation-reminder/${data.reservationId}`,
    operation: "sendReservationReminderEmail",
    context: {
      reservationId: data.reservationId,
      email: data.customerEmail,
    },
  });
}
