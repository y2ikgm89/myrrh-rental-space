/**
 * システム通知メール
 *
 * カレンダー同期エラー、Webhook 更新通知メールの送信。
 *
 * @module shared/lib/email/system-emails
 */

import "server-only";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";
import { getAdminUrl } from "../admin-urls";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

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
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const currentDate = formatDateWithWeekday(data.currentStartTime);
  const currentStart = formatTimeShort(data.currentStartTime);
  const currentEnd = formatTimeShort(data.currentEndTime);

  const attemptedDate = formatDateWithWeekday(data.attemptedStartTime);
  const attemptedStart = formatTimeShort(data.attemptedStartTime);
  const attemptedEnd = formatTimeShort(data.attemptedEndTime);

  const conflictDate = formatDateWithWeekday(
    data.conflictingReservation.startTime,
  );
  const conflictStart = formatTimeShort(data.conflictingReservation.startTime);
  const conflictEnd = formatTimeShort(data.conflictingReservation.endTime);

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

  return sendEmail({
    payload: {
      to: notificationEmails,
      subject: `【カレンダー同期エラー】時間変更拒否 - ${data.spaceName}`,
      text: textContent,
    },
    idempotencyKey: `calendar-sync-rejection/${data.reservationId}/${data.attemptedStartTime.getTime()}`,
    operation: "sendCalendarSyncRejectionEmail",
    context: {
      reservationId: data.reservationId,
    },
  });
}

/**
 * Webhook更新通知メールを送信
 *
 * 各更新実行は一意のため idempotency key は不要（24 時間以内の同じ更新イベントは
 * 理論上発生しない）
 */
export async function sendWebhookRenewalNotification(data: {
  success: boolean;
  newExpiration?: Date;
  error?: string;
}): Promise<EmailResult> {
  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const subject = data.success
    ? "【Google Calendar】Webhook自動更新完了"
    : "【エラー】Google Calendar Webhook自動更新失敗";

  const now = new Date();
  const renewedAt = `${formatDateWithWeekday(now)} ${formatTimeShort(now)}`;
  const newExpirationStr = data.newExpiration
    ? `${formatDateWithWeekday(data.newExpiration)} ${formatTimeShort(data.newExpiration)}`
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

  return sendEmail({
    payload: {
      to: notificationEmails,
      subject,
      text: textContent,
    },
    operation: "sendWebhookRenewalNotification",
  });
}
