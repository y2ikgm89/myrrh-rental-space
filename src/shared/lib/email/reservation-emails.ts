/**
 * 予約関連メール
 *
 * 予約確認、キャンセル通知、管理者通知メールの送信。
 *
 * @module shared/lib/email/reservation-emails
 */

import "server-only";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import { BulkReservationCancelledEmail } from "@/shared/emails/bulk-reservation-cancelled";
import { ReservationCancelledEmail } from "@/shared/emails/reservation-cancelled";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { ReservationUpdatedEmail } from "@/shared/emails/reservation-updated";
import { ReservationStatusChangedEmail } from "@/shared/emails/reservation-status-changed";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
} from "@/shared/domain/settings/queries/notification";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import {
  computeCancelTokenExpiresAt,
  createCancelToken,
} from "@/shared/lib/reservation-cancel-token";
import { createCalendarToken } from "@/shared/lib/calendar/calendar-token";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";
import { RESERVATION_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";
import { CANCELLATION_POLICY_TERMS_TYPE } from "@/shared/lib/validations/terms";
import { getAdminUrl } from "../admin-urls";
import { getAppHost, getAppUrl } from "../constants";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import {
  buildAddToCalendarUrls,
  buildReservationCalendar,
  buildReservationCancelCalendar,
} from "../ical";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import type {
  BulkReservationCancelledEmailData,
  EmailResult,
  ReservationEmailData,
  StatusChangeEmailData,
} from "./types";

/**
 * 予約 ID から、会員向けマイページの予約詳細 URL を組み立てる。
 * userId が無い（ゲスト予約）場合は undefined を返す。
 *
 * reminder-emails.ts / review-emails.ts からも参照される SSoT のため export する。
 */
export function buildMemberReservationUrl(
  userId: string | null | undefined,
  reservationId: string,
): string | undefined {
  if (!userId) return undefined;
  return `${getAppUrl()}/mypage/reservations/${reservationId}`;
}

/**
 * 公開中のキャンセルポリシー規約の絶対 URL を解決する。該当文書が無ければ
 * undefined を返し、呼び出し側はプレーンテキストにフォールバックする。
 */
async function resolveCancellationPolicyUrl(): Promise<string | undefined> {
  const doc = await getPublishedTermsByType(CANCELLATION_POLICY_TERMS_TYPE);
  return doc ? `${getAppUrl()}/terms/${doc.slug}` : undefined;
}

/**
 * 予約確認メールを送信
 */
export async function sendReservationConfirmationEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const { sendReservationConfirmationEmail: enabled } =
    await getEmailDeliverySettings();
  if (!enabled) return { ok: false, reason: "disabled" };

  const reservationDate = formatDateWithWeekday(data.startTime);
  const startTime = formatTimeShort(data.startTime);
  const endTime = formatTimeShort(data.endTime);

  const [
    calendarSettings,
    deadlineSettings,
    organizer,
    footer,
    cancellationPolicyUrl,
  ] = await Promise.all([
    getCalendarEmailSettings(),
    getReservationDeadlineSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
    resolveCancellationPolicyUrl(),
  ]);
  const appUrl = getAppUrl();
  const host = getAppHost();

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  // ゲストでもログイン不要で .ics をダウンロードできるよう、署名付きトークンを URL に付与する。
  // 寿命は CALENDAR_TOKEN_LIFETIME_MS (30 日)。会員も同じ URL を踏むため挙動は分岐しない。
  const icsDownloadUrl = `${appUrl}/api/calendar/reservation/${data.reservationId}?token=${createCalendarToken("reservation", data.reservationId)}`;
  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? buildAddToCalendarUrls({
        summary: `【予約】${data.spaceName}`,
        description: [
          `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
          `スペース: ${data.spaceName}`,
          `日時: ${reservationDate} ${startTime} - ${endTime}`,
        ].join("\n"),
        startTime: data.startTime,
        endTime: data.endTime,
        ...(data.location !== undefined ? { location: data.location } : {}),
        icsDownloadUrl,
      })
    : undefined;

  // 期限内のみ有効なキャンセルトークン URL を発行。
  // 会員でも非会員でも cancelUrl は発行する（マイページが落ちている時の保険として）。
  // 漏洩窓を最小化するため、トークン寿命は MAX_CANCEL_TOKEN_LIFETIME_MS（7 日）で上限。
  // 7 日を超える先の予約では確認メールのリンクは 7 日で expired となり、リマインダ
  // 送信時に新トークンが再発行される。
  const cancelDeadline = computeCancelTokenExpiresAt(
    data.startTime,
    deadlineSettings.cancellationDeadlineHours,
  );
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/reservation/cancel?token=${createCancelToken(data.reservationId, cancelDeadline)}`
      : undefined;

  const memberReservationUrl = buildMemberReservationUrl(
    data.userId,
    data.reservationId,
  );

  // ゲスト予約のみ、マイページに予約を追加する claim リンクを発行する（会員は不要）。
  const claimUrl = data.userId
    ? undefined
    : `${appUrl}/claim/reservation?token=${createReservationClaimToken(data.reservationId)}`;

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildReservationCalendar(calendarParams, host),
            "utf-8",
          ),
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
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【ご予約確認】${data.spaceName} - ${reservationDate}`,
      react: ReservationConfirmationEmail(
        omitUndefined({
          customerName: data.customerName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          totalPrice: formatPrice(data.totalPrice, "未設定"),
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
          notes: data.notes,
          addToCalendarLinks,
          cancelUrl,
          memberReservationUrl,
          claimUrl,
          cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
          modificationDeadlineHours: deadlineSettings.modificationDeadlineHours,
          cancellationPolicyUrl,
          smartLockPasscodes: data.smartLockPasscodes,
          smartLockIssuanceFailed: data.smartLockIssuanceFailed,
          smartLockFallbackContact: data.smartLockFallbackContact,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `reservation-confirm/${data.reservationId}`,
    operation: "sendReservationConfirmationEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約内容変更通知メールを送信
 *
 * 顧客セルフ日時変更・管理者編集のいずれの経路でも、日時・スペース・料金など
 * 顧客に影響する変更があった場合に呼ぶ。ステータス変更/キャンセル同様、重要な
 * 取引通知として `sendReservationConfirmationEmail` のような Settings トグルは
 * 持たず常時送信する。
 */
export async function sendReservationUpdatedEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const reservationDate = formatDateWithWeekday(data.startTime);
  const startTime = formatTimeShort(data.startTime);
  const endTime = formatTimeShort(data.endTime);

  const [
    calendarSettings,
    deadlineSettings,
    organizer,
    footer,
    cancellationPolicyUrl,
  ] = await Promise.all([
    getCalendarEmailSettings(),
    getReservationDeadlineSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
    resolveCancellationPolicyUrl(),
  ]);
  const appUrl = getAppUrl();
  const host = getAppHost();

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  const icsDownloadUrl = `${appUrl}/api/calendar/reservation/${data.reservationId}?token=${createCalendarToken("reservation", data.reservationId)}`;
  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? buildAddToCalendarUrls({
        summary: `【予約】${data.spaceName}`,
        description: [
          `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
          `スペース: ${data.spaceName}`,
          `日時: ${reservationDate} ${startTime} - ${endTime}`,
        ].join("\n"),
        startTime: data.startTime,
        endTime: data.endTime,
        ...(data.location !== undefined ? { location: data.location } : {}),
        icsDownloadUrl,
      })
    : undefined;

  const cancelDeadline = computeCancelTokenExpiresAt(
    data.startTime,
    deadlineSettings.cancellationDeadlineHours,
  );
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/reservation/cancel?token=${createCancelToken(data.reservationId, cancelDeadline)}`
      : undefined;

  const memberReservationUrl = buildMemberReservationUrl(
    data.userId,
    data.reservationId,
  );

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildReservationCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalUpdateAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【ご予約内容変更】${data.spaceName} - ${reservationDate}`,
      react: ReservationUpdatedEmail(
        omitUndefined({
          customerName: data.customerName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          totalPrice: formatPrice(data.totalPrice, "未設定"),
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
          notes: data.notes,
          addToCalendarLinks,
          cancelUrl,
          memberReservationUrl,
          cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
          modificationDeadlineHours: deadlineSettings.modificationDeadlineHours,
          cancellationPolicyUrl,
          smartLockPasscodes: data.smartLockPasscodes,
          smartLockIssuanceFailed: data.smartLockIssuanceFailed,
          smartLockFallbackContact: data.smartLockFallbackContact,
          footer,
        }),
      ),
      attachments,
    }),
    // icsSequence を含めることで、同一予約が短時間に複数回変更されても
    // idempotency key が衝突せず Resend が silent drop しないようにする。
    idempotencyKey: `reservation-update/${data.reservationId}/${data.icsSequence}`,
    operation: "sendReservationUpdatedEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約キャンセルメールを送信（CANCEL ICS 添付）
 */
export async function sendReservationCancelledEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const reservationDate = formatDateWithWeekday(data.startTime);
  const startTime = formatTimeShort(data.startTime);
  const endTime = formatTimeShort(data.endTime);

  const [calendarSettings, organizer, footer, cancellationPolicyUrl] =
    await Promise.all([
      getCalendarEmailSettings(),
      getIcalOrganizer(),
      getEmailFooterData(),
      resolveCancellationPolicyUrl(),
    ]);
  const host = getAppHost();

  const memberReservationUrl = buildMemberReservationUrl(
    data.userId,
    data.reservationId,
  );

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-cancel-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildReservationCancelCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalCancelAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【予約キャンセル】${data.spaceName} - ${reservationDate}`,
      react: ReservationCancelledEmail(
        omitUndefined({
          customerName: data.customerName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
          memberReservationUrl,
          cancellationPolicyUrl,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `reservation-cancel/${data.reservationId}`,
    operation: "sendReservationCancelledEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約ステータス変更通知メールを送信
 * CANCELLED の場合は CANCEL ICS を添付、それ以外は REQUEST ICS を添付
 */
export async function sendReservationStatusChangedEmail(
  data: StatusChangeEmailData,
): Promise<EmailResult> {
  const reservationDate = formatDateWithWeekday(data.startTime);
  const startTime = formatTimeShort(data.startTime);
  const endTime = formatTimeShort(data.endTime);

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const appUrl = getAppUrl();
  const host = getAppHost();

  const isCancelled = data.newStatus === ReservationStatus.CANCELLED;

  const calendarParams = omitUndefined({
    reservationId: data.reservationId,
    spaceName: data.spaceName,
    customerName: data.customerName,
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  });

  const addToCalendarLinks =
    !isCancelled && calendarSettings.addToCalendarLinksEnabled
      ? buildAddToCalendarUrls({
          summary: `【予約】${data.spaceName}`,
          description: [
            `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
            `スペース: ${data.spaceName}`,
            `日時: ${reservationDate} ${startTime} - ${endTime}`,
          ].join("\n"),
          startTime: data.startTime,
          endTime: data.endTime,
          ...(data.location !== undefined ? { location: data.location } : {}),
          icsDownloadUrl: `${appUrl}/api/calendar/reservation/${data.reservationId}?token=${createCalendarToken("reservation", data.reservationId)}`,
        })
      : undefined;

  const memberReservationUrl = buildMemberReservationUrl(
    data.userId,
    data.reservationId,
  );

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      const icsContent = isCancelled
        ? buildReservationCancelCalendar(calendarParams, host)
        : buildReservationCalendar(calendarParams, host);
      const filePrefix = isCancelled ? "reservation-cancel-" : "reservation-";
      attachments = [
        {
          filename: `${filePrefix}${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(icsContent, "utf-8"),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalStatusChangeAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【予約ステータス更新】${data.spaceName} - ${reservationDate}`,
      react: ReservationStatusChangedEmail(
        omitUndefined({
          customerName: data.customerName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          totalPrice: formatPrice(data.totalPrice, "未設定"),
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
          newStatus: data.newStatus,
          location: data.location,
          addToCalendarLinks,
          memberReservationUrl,
          smartLockPasscodes: data.smartLockPasscodes,
          footer,
        }),
      ),
      attachments,
    }),
    // icsSequence は status 変更ごとに増分されるため、24h 内に同一予約で複数回 status 変更
    // が起きても idempotency key が衝突せず Resend が `invalid_idempotent_request` で
    // silent drop することを防ぐ。
    idempotencyKey: `reservation-status/${data.reservationId}/${data.newStatus}/${data.icsSequence}`,
    operation: "sendReservationStatusChangedEmail",
    context: {
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  });
}

/**
 * 予約に関する管理者通知メールを送信
 */
export async function sendReservationAdminNotification(
  data: ReservationEmailData,
  action: "new" | "update" | "cancel",
): Promise<EmailResult> {
  const toggles = await getEmailDeliverySettings();
  const enabledByAction = {
    new: toggles.notifyNewReservation,
    update: toggles.notifyReservationChange,
    cancel: toggles.notifyReservationCancel,
  }[action];
  if (!enabledByAction) return { ok: false, reason: "disabled" };

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();

  const reservationDate = formatDateWithWeekday(data.startTime);
  const startTime = formatTimeShort(data.startTime);
  const endTime = formatTimeShort(data.endTime);

  const actionText = RESERVATION_ACTION_LABELS[action];

  return sendEmail({
    payload: {
      to: notificationEmails,
      subject: `【${actionText}】${data.spaceName} - ${data.customerName}様`,
      react: AdminNotificationEmail(
        omitUndefined({
          type: "reservation" as const,
          action,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          guestName: data.guestName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          totalPrice: formatPrice(data.totalPrice, "未設定"),
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
          adminUrl: getAdminUrl(`/reservations/${data.reservationId}`),
          footer,
        }),
      ),
    },
    idempotencyKey: `reservation-admin/${data.reservationId}/${action}`,
    operation: "sendReservationAdminNotification",
    context: {
      reservationId: data.reservationId,
      action,
    },
  });
}

/** `BulkReservationCancelledEmailData.instances` を表示用の日付/時刻文字列に整形する。 */
function formatBulkInstanceList(
  instances: BulkReservationCancelledEmailData["instances"],
): { date: string; time: string }[] {
  return instances.map((instance) => ({
    date: formatDateWithWeekday(instance.startTime),
    time: `${formatTimeShort(instance.startTime)} - ${formatTimeShort(instance.endTime)}`,
  }));
}

/**
 * Phase B.2 task 12: series 一括キャンセルの集約通知メール（顧客向け・1 通）。
 *
 * `applyBulkCancellationSideEffects` が各 instance の
 * `sendReservationCancelledEmail` を suppress した上で、series 単位にまとめて
 * 本関数を 1 回だけ呼ぶ（N 通スパム防止、Codex fix 3599414659 / spec §4.5）。
 */
export async function sendBulkReservationCancelledEmail(
  data: BulkReservationCancelledEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();
  const reservationList = formatBulkInstanceList(data.instances);

  return sendEmail({
    payload: omitUndefined({
      to: data.customerEmail,
      subject: `【予約キャンセル】${data.spaceName} 定期予約（${String(data.instances.length)}件）`,
      react: BulkReservationCancelledEmail(
        omitUndefined({
          customerName: data.customerName,
          seriesTitle: data.spaceName,
          instanceCount: data.instances.length,
          reservationList,
          reason: data.reason,
          footer,
        }),
      ),
    }),
    idempotencyKey: `bulk-reservation-cancel/${data.seriesId}`,
    operation: "sendBulkReservationCancelledEmail",
    context: {
      seriesId: data.seriesId,
      instanceCount: data.instances.length,
    },
  });
}

/**
 * Phase B.2 task 12: series 一括キャンセルの集約通知メール（管理者向け・1 通）。
 *
 * 既存の `sendReservationAdminNotification` と同じ通知トグル
 * （`notifyReservationCancel`）・宛先解決（`getNotificationEmailAddresses`）で
 * gating する。本文は顧客向けと同じ skeleton テンプレートを流用する
 * （管理者専用の文言・deep link は Task 27 で最終調整）。
 */
export async function sendBulkAdminNotification(
  data: BulkReservationCancelledEmailData,
): Promise<EmailResult> {
  const toggles = await getEmailDeliverySettings();
  if (!toggles.notifyReservationCancel) {
    return { ok: false, reason: "disabled" };
  }

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();
  const reservationList = formatBulkInstanceList(data.instances);

  return sendEmail({
    payload: {
      to: notificationEmails,
      subject: `【定期予約一括キャンセル】${data.spaceName} - ${data.customerName}様`,
      react: BulkReservationCancelledEmail(
        omitUndefined({
          customerName: data.customerName,
          seriesTitle: data.spaceName,
          instanceCount: data.instances.length,
          reservationList,
          reason: data.reason,
          footer,
        }),
      ),
    },
    idempotencyKey: `bulk-reservation-cancel-admin/${data.seriesId}`,
    operation: "sendBulkAdminNotification",
    context: {
      seriesId: data.seriesId,
      instanceCount: data.instances.length,
    },
  });
}
