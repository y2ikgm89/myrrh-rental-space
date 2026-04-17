import "server-only";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { ReminderEmailData, EmailResult } from "./types";

export async function sendReservationReminderEmail(
  data: ReminderEmailData,
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
    location: data.location ?? "",
    notes: data.notes ?? "",
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.RESERVATION_REMINDER,
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
          react: ReservationReminderEmail({
            spaceName: data.spaceName,
            startTime: data.startTime,
            endTime: data.endTime,
            location: data.location,
            notes: data.notes,
            greeting: resolved.greeting,
            intro: resolved.intro,
            outro: resolved.outro,
            preview: resolved.preview,
            companyName: resolved.companyName,
            ...(resolved.footerNote !== undefined && {
              footerNote: resolved.footerNote,
            }),
            ...(resolved.supportContactText !== undefined && {
              supportContactText: resolved.supportContactText,
            }),
          }),
        }),
      ),
    {
      operation: "sendReservationReminderEmail",
      reservationId: data.reservationId,
      email: data.customerEmail,
    },
  );
}
