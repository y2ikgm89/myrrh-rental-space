import { unstable_rethrow } from "next/navigation";
import { findReservationsForReminderWindow } from "@/shared/domain/reservations/admin-queries";
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  try {
    const authorizationResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "reservationReminderCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfWindow = new Date(tomorrow);
    startOfWindow.setHours(0, 0, 0, 0);
    const endOfWindow = new Date(tomorrow);
    endOfWindow.setHours(23, 59, 59, 999);

    const reservations = await findReservationsForReminderWindow(
      startOfWindow,
      endOfWindow,
    );

    let sent = 0;
    let skipped = 0;

    for (const reservation of reservations) {
      const email = reservation.customer?.email;
      if (!email) {
        skipped++;
        continue;
      }

      try {
        await sendReservationReminderEmail({
          reservationId: reservation.id,
          customerEmail: email,
          customerName:
            `${reservation.customer?.lastName ?? ""} ${reservation.customer?.firstName ?? ""}`.trim() ||
            "お客様",
          spaceName: reservation.space.name,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          location: reservation.space.location?.name,
          notes: reservation.notes ?? undefined,
        });
        sent++;
      } catch (error) {
        logError(error, {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "reservationReminder",
            reservationId: reservation.id,
          },
        });
        skipped++;
      }
    }

    return jsonSuccess({ sent, skipped, total: reservations.length });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "reservationReminderCron" },
    });
    return jsonError("Internal error", 500);
  }
}
