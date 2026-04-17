/**
 * システム通知メール
 *
 * カレンダー同期エラー、スタッフ招待、Webhook 更新通知メールの送信。
 *
 * @module shared/lib/email/system-emails
 */

import "server-only";
import { StaffInvitationEmail } from "@/shared/emails/staff-invitation";
import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { getAdminUrl } from "../constants";
import { omitUndefined } from "../serialize";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { StaffInvitationEmailData, EmailResult } from "./types";

// =============================================================================
// System Notification Emails
// =============================================================================

/**
 * カレンダー同期による時間変更拒否の管理者通知メールを送信
 */
export async function sendCalendarSyncRejectionEmail(data: {
  reservationId: string;
  spaceName: string;
  customerName: string;
  customerEmail: string;
  attemptedStartTime: Date;
  attemptedEndTime: Date;
  currentStartTime: Date;
  currentEndTime: Date;
  conflictingReservation: {
    id: string;
    startTime: Date;
    endTime: Date;
  };
}): Promise<EmailResult> {
  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { success: true };

  const currentDate = format(data.currentStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const currentStart = format(data.currentStartTime, "HH:mm");
  const currentEnd = format(data.currentEndTime, "HH:mm");

  const attemptedDate = format(data.attemptedStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const attemptedStart = format(data.attemptedStartTime, "HH:mm");
  const attemptedEnd = format(data.attemptedEndTime, "HH:mm");

  const conflictDate = format(
    data.conflictingReservation.startTime,
    "yyyy年M月d日 (EEEE)",
    {
      locale: ja,
    },
  );
  const conflictStart = format(data.conflictingReservation.startTime, "HH:mm");
  const conflictEnd = format(data.conflictingReservation.endTime, "HH:mm");

  const textContent = `
カレンダー同期エラー: 時間変更が拒否されました

予約番号: ${data.reservationId.slice(0, 8).toUpperCase()}
お客様: ${data.customerName} (${data.customerEmail})
スペース: ${data.spaceName}

現在の予約時間（変更なし）:
  ${currentDate} ${currentStart} - ${currentEnd}

試行された変更時間（拒否）:
  ${attemptedDate} ${attemptedStart} - ${attemptedEnd}

拒否理由: 以下の予約と重複
  予約ID: ${data.conflictingReservation.id.slice(0, 8).toUpperCase()}
  時間: ${conflictDate} ${conflictStart} - ${conflictEnd}

対応が必要な場合は、管理画面で予約を確認してください:
${getAdminUrl(`/reservations/${data.reservationId}`)}

※ Google Calendarでの変更は反映されていません。予約は元の時間のままです。
    `.trim();

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: notificationEmails,
        subject: `【カレンダー同期エラー】時間変更拒否 - ${data.spaceName}`,
        text: textContent,
      }),
    {
      operation: "sendCalendarSyncRejectionEmail",
      reservationId: data.reservationId,
    },
  );
}

/**
 * スタッフ招待メールを送信
 */
export async function sendStaffInvitationEmail(
  data: StaffInvitationEmailData,
): Promise<EmailResult> {
  const expiresAtFormatted = format(data.expiresAt, "yyyy年M月d日 HH:mm", {
    locale: ja,
  });

  const variables = omitUndefined({
    userName: data.staffName,
    staffName: data.staffName,
    setupUrl: data.setupUrl,
    invitationUrl: data.setupUrl,
    expiresAt: expiresAtFormatted,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.STAFF_INVITATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.to,
        subject: resolved.subject,
        react: StaffInvitationEmail(
          omitUndefined({
            setupUrl: data.setupUrl,
            expiresAt: data.expiresAt,
            greeting: resolved.greeting,
            intro: resolved.intro,
            outro: resolved.outro,
            preview: resolved.preview,
            companyName: resolved.companyName,
            footerNote: resolved.footerNote,
            supportContactText: resolved.supportContactText,
          }),
        ),
      }),
    {
      operation: "sendStaffInvitationEmail",
      to: data.to,
    },
  );
}

/**
 * Webhook更新通知メールを送信
 */
export async function sendWebhookRenewalNotification(data: {
  success: boolean;
  newExpiration?: Date;
  error?: string;
}): Promise<EmailResult> {
  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { success: true };

  const subject = data.success
    ? "【Google Calendar】Webhook自動更新完了"
    : "【エラー】Google Calendar Webhook自動更新失敗";

  const renewedAt = format(new Date(), "yyyy年M月d日 HH:mm", { locale: ja });
  const newExpirationStr = data.newExpiration
    ? format(data.newExpiration, "yyyy年M月d日 HH:mm", { locale: ja })
    : "不明";

  let textContent: string;
  if (data.success) {
    textContent = `
Google Calendar Webhookが自動更新されました。

更新日時: ${renewedAt}
新しい有効期限: ${newExpirationStr}

次の更新は有効期限の2日前に自動実行されます。
      `.trim();
  } else {
    textContent = `
Google Calendar Webhookの自動更新に失敗しました。

更新試行日時: ${renewedAt}
エラー: ${data.error || "不明なエラー"}

対応が必要です。管理画面から手動でWebhookを再設定してください:
${getAdminUrl("/settings")}

※ ポーリングが設定されている場合は、引き続きポーリングで同期されます。
      `.trim();
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: notificationEmails,
        subject,
        text: textContent,
      }),
    { operation: "sendWebhookRenewalNotification" },
  );
}
