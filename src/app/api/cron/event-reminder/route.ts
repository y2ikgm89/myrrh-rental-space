import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { formatJstDateString, MS_PER_DAY } from "@/shared/lib/date-format";
import { findEventRegistrationsForReminderWindow } from "@/shared/domain/events/registration-queries";
import {
  claimEventRegistrationReminder,
  releaseEventRegistrationReminderClaim,
} from "@/shared/domain/events/registration-commands";
import { sendEventReminderEmail } from "@/shared/lib/email/event-emails";
import { getEmailDeliverySettings } from "@/shared/domain/settings/queries/notification";
import { formatEventVenue } from "@/shared/domain/events/venue";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "eventReminderCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // Feature module gate — events OFF なら早期 return
    if (!(await isFeatureEnabled("events"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    // 参加者全員への一斉送信はメール量が増えやすいため既定 OFF（opt-in）。
    // Settings.notifyEventReminder が無効なら早期 return する。
    const { notifyEventReminder } = await getEmailDeliverySettings();
    if (!notifyEventReminder) {
      return jsonSuccess({ skipped: true, reason: "notification_disabled" });
    }

    // JST で翌日の日付を計算（Cloud Run は UTC 環境）
    const now = new Date();
    const tomorrow = new Date(now.getTime() + MS_PER_DAY);
    const tomorrowJstStr = formatJstDateString(tomorrow); // "YYYY-MM-DD"

    // JST の翌日 00:00:00 〜 23:59:59 を UTC に変換
    const startOfWindow = new Date(`${tomorrowJstStr}T00:00:00+09:00`);
    const endOfWindow = new Date(`${tomorrowJstStr}T23:59:59.999+09:00`);

    const registrations = await findEventRegistrationsForReminderWindow(
      startOfWindow,
      endOfWindow,
    );

    let sent = 0;
    let skipped = 0;

    for (const registration of registrations) {
      const email = registration.email;
      if (!email) {
        skipped++;
        continue;
      }

      // 冪等性: 送信前に atomic claim を取得し、勝者のみ送信する。
      // 二重起動（Cloud Scheduler の at-least-once / 手動再実行）で同じ申込に
      // 重複送信するのを防ぐ。claim できなければ既送信扱いで skip。
      const claimed = await claimEventRegistrationReminder(registration.id);
      if (!claimed) {
        skipped++;
        continue;
      }

      try {
        const location = formatEventVenue({
          location: registration.event.location,
          space: registration.event.space,
          addressDetail: registration.event.addressDetail,
        });

        const result = await sendEventReminderEmail({
          registrationId: registration.id,
          customerName: registration.name,
          customerEmail: email,
          eventTitle: registration.event.title,
          eventStartTime: registration.slot.startAt,
          eventEndTime: registration.slot.endAt,
          location: location ?? undefined,
          quantity: registration.quantity,
          icsSequence: registration.icsSequence,
          customerId: registration.customerId,
        });

        // sendEmail は送信失敗時に throw せず { ok: false, ... } を返す。
        // disabled（RESEND_API_KEY 未設定）: claim を保持して永続 skipped 扱い
        //   → 次回 cron でも claim できないため無限 retry を防ぐ
        // error: claim を解放して次回 cron で再送できるようにする
        if (!result.ok) {
          if (result.reason !== "disabled") {
            await releaseEventRegistrationReminderClaim(registration.id);
          }
          skipped++;
          continue;
        }

        sent++;
      } catch (error) {
        await releaseEventRegistrationReminderClaim(registration.id);
        logError(error, {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "eventReminder",
            registrationId: registration.id,
          },
        });
        skipped++;
      }
    }

    return jsonSuccess({ sent, skipped, total: registrations.length });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "eventReminderCron" },
    });
    return jsonError("Internal error", 500);
  }
}
