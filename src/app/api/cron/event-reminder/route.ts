import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { formatJstDateString, MS_PER_DAY } from "@/shared/lib/date-format";
import { findEventRegistrationsForReminderWindow } from "@/shared/domain/events/registration-queries";
import {
  claimEventRegistrationReminder,
  releaseEventRegistrationReminderClaim,
} from "@/shared/domain/events/registration-commands";
import { isEmailEnabled } from "@/shared/lib/email/client";
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

    // Resend 未設定等でメール送信が丸ごと disabled なら claim 前に早期 return。
    // claim 後に disabled になると reminder が永久に送られなくなるため、ここが主経路。
    if (!(await isEmailEnabled())) {
      return jsonSuccess({ skipped: true, reason: "email_disabled" });
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
    let disabledCount = 0;

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
          format: registration.event.format,
          meetingUrl: registration.event.meetingUrl,
        });

        // sendEmail は送信失敗時に throw せず { ok: false, ... } を返す。
        // グローバルな email disabled は claim 前の isEmailEnabled() 早期 return が主経路。
        // ここでの disabled は実行中にキーが外れた等の race 用 defense-in-depth:
        // claim を保持して永続 skipped 扱い（無限 retry 防止）。
        // error: claim を解放して次回 cron で再送できるようにする
        if (!result.ok) {
          if (result.reason !== "disabled") {
            await releaseEventRegistrationReminderClaim(registration.id);
          } else {
            disabledCount++;
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

    // defense-in-depth: ループ実行中に email が disabled 化した race のみここに到達する
    // （通常のグローバル disabled は claim 前の isEmailEnabled() 早期 return）。
    // claim 消費のまま永久 skip になるため、cron 1 回につき集約して 1 回だけ記録する。
    if (disabledCount > 0) {
      logError(
        new Error(
          `event-reminder: email delivery disabled, ${disabledCount} reminder(s) skipped without release`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "eventReminderCron",
            disabledCount,
            total: registrations.length,
          },
        },
      );
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
