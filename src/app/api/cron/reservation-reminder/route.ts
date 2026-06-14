import { unstable_rethrow } from "next/navigation";
import { formatJstDateString } from "@/shared/lib/date-format";
import { findReservationsForReminderWindow } from "@/shared/domain/reservations/admin-queries";
import {
  claimReservationReminder,
  releaseReservationReminderClaim,
} from "@/shared/domain/reservations/reminder-commands";
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
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

    // Feature module gate — reservation OFF なら早期 return
    if (!(await isFeatureEnabled("reservation"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    // JST で翌日の日付を計算（Cloud Run は UTC 環境）
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowJstStr = formatJstDateString(tomorrow); // "YYYY-MM-DD"

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

      // 冪等性: 送信前に atomic claim を取得し、勝者のみ送信する。
      // 二重起動（Cloud Scheduler の at-least-once / 手動再実行）で同じ予約に
      // 重複送信するのを防ぐ。claim できなければ既送信扱いで skip。
      const claimed = await claimReservationReminder(reservation.id);
      if (!claimed) {
        skipped++;
        continue;
      }

      try {
        const result = await sendReservationReminderEmail({
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
          icsSequence: reservation.icsSequence,
        });

        // sendEmail は送信失敗時に throw せず { success: false } を返す。
        // 失敗時は claim を解放して次回 cron で再送できるようにする。
        if (!result.success) {
          await releaseReservationReminderClaim(reservation.id);
          skipped++;
          continue;
        }

        sent++;
      } catch (error) {
        await releaseReservationReminderClaim(reservation.id);
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
