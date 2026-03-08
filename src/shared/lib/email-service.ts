/**
 * メール送信サービス
 *
 * 予約確認、お問い合わせ確認、管理者通知などのメール送信を行うサービス。
 * Resend APIを使用してメールを配信します。
 *
 * ## 対応メール種別
 * - **予約関連**: 予約確認、予約キャンセル、管理者通知
 * - **お問い合わせ**: 確認メール、管理者通知
 * - **システム**: カレンダー同期エラー、Webhook更新通知
 * - **スタッフ**: 招待メール
 *
 * ## 添付機能
 * - iCalファイル添付（予約確認メール）
 * - Add to Calendarリンク（Google/Outlook/Apple）
 *
 * @module shared/lib/email-service
 */

import "server-only";
import { getResendClient, getFromAddress, isEmailEnabled } from "./email";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "./errors/server";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { ReservationCancelledEmail } from "@/shared/emails/reservation-cancelled";
import { ContactConfirmationEmail } from "@/shared/emails/contact-confirmation";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import { StaffInvitationEmail } from "@/shared/emails/staff-invitation";
import {
  getCalendarEmailSettings as getCalendarEmailSettingsQuery,
  getNotificationEmailAddresses as getNotificationEmailAddressesQuery,
} from "@/shared/domain/settings/queries";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  createReservationEvent,
  generateAddToCalendarLinks,
  generateICalContent,
} from "@/shared/lib/ical";
import { getAdminUrl, SITE_DEFAULTS } from "./constants";

// =============================================================================
// Types
// =============================================================================

type ReservationEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string;
  location?: string;
};

type ContactEmailData = {
  inquiryId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
};

type StaffInvitationEmailData = {
  to: string;
  staffName: string;
  setupUrl: string;
  expiresAt: Date;
};

// =============================================================================
// Helper Functions
// =============================================================================

async function getNotificationEmails(): Promise<string[]> {
  return getNotificationEmailAddressesQuery();
}

function formatPrice(price: number | null): string {
  if (price === null) return "未設定";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(price);
}

// =============================================================================
// Reservation Emails
// =============================================================================

/**
 * カレンダー設定を取得
 */
async function getCalendarEmailSettings(): Promise<{
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
}> {
  return getCalendarEmailSettingsQuery();
}

/**
 * 予約確認メールを送信
 */
export async function sendReservationConfirmationEmail(
  data: ReservationEmailData,
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
      locale: ja,
    });
    const startTime = format(data.startTime, "HH:mm", { locale: ja });
    const endTime = format(data.endTime, "HH:mm", { locale: ja });

    // カレンダー設定を取得
    const calendarSettings = await getCalendarEmailSettings();

    // カレンダーイベントを生成
    const calendarEvent = createReservationEvent({
      reservationId: data.reservationId,
      spaceName: data.spaceName,
      customerName: data.customerName,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      notes: data.notes,
    });

    // Add to Calendarリンクを生成
    const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
      ? generateAddToCalendarLinks(calendarEvent)
      : undefined;

    // iCalファイルを生成（添付用）
    let attachments: { filename: string; content: Buffer }[] | undefined;
    if (calendarSettings.icalAttachmentEnabled) {
      try {
        attachments = [
          {
            filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
            content: Buffer.from(generateICalContent(calendarEvent), "utf-8"),
          },
        ];
      } catch (icalError) {
        logError(normalizeError(icalError), {
          category: ErrorCategory.UNKNOWN,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "generateICalAttachment",
            reservationId: data.reservationId,
          },
        });
        // 添付なしで続行
      }
    }

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: data.customerEmail,
      subject: `【ご予約確認】${data.spaceName} - ${reservationDate}`,
      react: ReservationConfirmationEmail({
        customerName: data.customerName,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        totalPrice: formatPrice(data.totalPrice),
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
        notes: data.notes,
        addToCalendarLinks,
      }),
      attachments,
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendReservationConfirmationEmail",
          reservationId: data.reservationId,
          customerEmail: data.customerEmail,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendReservationConfirmationEmail",
        reservationId: data.reservationId,
        customerEmail: data.customerEmail,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

/**
 * 予約キャンセルメールを送信
 *
 * 予約がキャンセルされた際に顧客へ通知メールを送信します。
 *
 * @param data - 予約メールデータ
 * @returns 送信結果
 */
export async function sendReservationCancelledEmail(
  data: ReservationEmailData,
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
      locale: ja,
    });
    const startTime = format(data.startTime, "HH:mm", { locale: ja });
    const endTime = format(data.endTime, "HH:mm", { locale: ja });

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: data.customerEmail,
      subject: `【予約キャンセル】${data.spaceName} - ${reservationDate}`,
      react: ReservationCancelledEmail({
        customerName: data.customerName,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
      }),
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendReservationCancelledEmail",
          reservationId: data.reservationId,
          customerEmail: data.customerEmail,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendReservationCancelledEmail",
        reservationId: data.reservationId,
        customerEmail: data.customerEmail,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

/**
 * 予約に関する管理者通知メールを送信
 *
 * 予約の作成・更新・キャンセル時に管理者へ通知メールを送信します。
 *
 * @param data - 予約メールデータ
 * @param action - アクション種別（new/update/cancel）
 * @returns 送信結果
 */
export async function sendReservationAdminNotification(
  data: ReservationEmailData,
  action: "new" | "update" | "cancel",
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const notificationEmails = await getNotificationEmails();
    if (notificationEmails.length === 0) return { success: true };

    const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
      locale: ja,
    });
    const startTime = format(data.startTime, "HH:mm", { locale: ja });
    const endTime = format(data.endTime, "HH:mm", { locale: ja });

    const actionText = {
      new: "新規予約",
      update: "予約変更",
      cancel: "予約キャンセル",
    }[action];

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject: `【${actionText}】${data.spaceName} - ${data.customerName}様`,
      react: AdminNotificationEmail({
        type: "reservation",
        action,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        totalPrice: formatPrice(data.totalPrice),
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
        adminUrl: getAdminUrl(`/reservations/${data.reservationId}`),
      }),
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendReservationAdminNotification",
          reservationId: data.reservationId,
          action,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendReservationAdminNotification",
        reservationId: data.reservationId,
        action,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

// =============================================================================
// Contact Emails
// =============================================================================

/**
 * お問い合わせ確認メールを送信
 *
 * お問い合わせフォーム送信後に顧客へ確認メールを送信します。
 *
 * @param data - お問い合わせメールデータ
 * @returns 送信結果
 */
export async function sendContactConfirmationEmail(
  data: ContactEmailData,
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: data.email,
      subject: `【お問い合わせ受付】${data.subject}`,
      react: ContactConfirmationEmail({
        name: data.name,
        subject: data.subject,
        message: data.message,
      }),
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendContactConfirmationEmail",
          inquiryId: data.inquiryId,
          email: data.email,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendContactConfirmationEmail",
        inquiryId: data.inquiryId,
        email: data.email,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

/**
 * お問い合わせ管理者通知メールを送信
 *
 * 新規お問い合わせを管理者へ通知するメールを送信します。
 *
 * @param data - お問い合わせメールデータ
 * @returns 送信結果
 */
export async function sendContactAdminNotification(
  data: ContactEmailData,
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const notificationEmails = await getNotificationEmails();
    if (notificationEmails.length === 0) return { success: true };

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject: `【新規お問い合わせ】${data.subject} - ${data.name}様`,
      react: AdminNotificationEmail({
        type: "inquiry",
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
        adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
      }),
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendContactAdminNotification",
          inquiryId: data.inquiryId,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendContactAdminNotification",
        inquiryId: data.inquiryId,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

// =============================================================================
// System Notification Emails
// =============================================================================

/**
 * カレンダー同期による時間変更拒否の管理者通知メールを送信
 *
 * Google Calendar側での時間変更が予約重複により拒否された場合に
 * 管理者へ通知メールを送信します。
 *
 * @param data - 同期拒否通知データ
 * @returns 送信結果
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
}): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const notificationEmails = await getNotificationEmails();
    if (notificationEmails.length === 0) return { success: true };

    const currentDate = format(data.currentStartTime, "yyyy年M月d日 (EEEE)", {
      locale: ja,
    });
    const currentStart = format(data.currentStartTime, "HH:mm");
    const currentEnd = format(data.currentEndTime, "HH:mm");

    const attemptedDate = format(
      data.attemptedStartTime,
      "yyyy年M月d日 (EEEE)",
      { locale: ja },
    );
    const attemptedStart = format(data.attemptedStartTime, "HH:mm");
    const attemptedEnd = format(data.attemptedEndTime, "HH:mm");

    const conflictDate = format(
      data.conflictingReservation.startTime,
      "yyyy年M月d日 (EEEE)",
      {
        locale: ja,
      },
    );
    const conflictStart = format(
      data.conflictingReservation.startTime,
      "HH:mm",
    );
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

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject: `【カレンダー同期エラー】時間変更拒否 - ${data.spaceName}`,
      text: textContent,
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendCalendarSyncRejectionEmail",
          reservationId: data.reservationId,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendCalendarSyncRejectionEmail",
        reservationId: data.reservationId,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

// =============================================================================
// Staff Invitation Emails
// =============================================================================

/**
 * スタッフ招待メールを送信
 *
 * 新規スタッフを招待するメールを送信します。
 * セットアップURLと有効期限を含みます。
 *
 * @param data - スタッフ招待メールデータ
 * @returns 送信結果
 */
export async function sendStaffInvitationEmail(
  data: StaffInvitationEmailData,
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: data.to,
      subject: `【スタッフ招待】${SITE_DEFAULTS.name}`,
      react: StaffInvitationEmail({
        staffName: data.staffName,
        setupUrl: data.setupUrl,
        expiresAt: data.expiresAt,
      }),
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "sendStaffInvitationEmail",
          to: data.to,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendStaffInvitationEmail",
        to: data.to,
      },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

/**
 * Webhook更新通知メールを送信
 *
 * Google Calendar Webhookの自動更新結果を管理者へ通知します。
 * 成功時は新しい有効期限、失敗時はエラー内容を含みます。
 *
 * @param data - Webhook更新通知データ
 * @returns 送信結果
 */
export async function sendWebhookRenewalNotification(data: {
  success: boolean;
  newExpiration?: Date;
  error?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    // Email disabled: RESEND_API_KEY not set - skip silently in development
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const notificationEmails = await getNotificationEmails();
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

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject,
      text: textContent,
    });

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { operation: "sendWebhookRenewalNotification" },
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: "sendWebhookRenewalNotification" },
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}
