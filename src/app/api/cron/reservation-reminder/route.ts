import { unstable_rethrow } from "next/navigation";
import { findReservationsForReminderWindow } from "@/shared/domain/reservations/admin-queries";
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
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

    // JST で翌日の日付を計算（Cloud Run は UTC 環境）
    const jstFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowJstStr = jstFormatter.format(tomorrow); // "YYYY-MM-DD"

    // JST の翌日 00:00:00 〜 23:59:59 を UTC に変換
    const startOfWindow = new Date(`${tomorrowJstStr}T00:00:00+09:00`);
    const endOfWindow = new Date(`${tomorrowJstStr}T23:59:59.999+09:00`);

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

      // Cron 実行中にキャンセルされた予約をスキップ
      if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
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
