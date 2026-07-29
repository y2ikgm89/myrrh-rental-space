/**
 * イベント関連メール
 *
 * イベント申込確認、キャンセル通知、管理者通知、イベント中止通知、イベント変更通知メールの送信。
 *
 * @module shared/lib/email/event-emails
 */

import "server-only";
import type {
  EventFormatValue,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
import { EventAdminNotificationEmail } from "@/shared/emails/event-admin-notification";
import { EventBroadcastEmail } from "@/shared/emails/event-broadcast";
import { EventCancelledNotificationEmail } from "@/shared/emails/event-cancelled-notification";
import { EventReminderEmail } from "@/shared/emails/event-reminder";
import { EventRegistrationCancelledEmail } from "@/shared/emails/event-registration-cancelled";
import { EventRegistrationConfirmationEmail } from "@/shared/emails/event-registration-confirmation";
import { shouldShowTransferAccounts } from "@/shared/lib/settings/transfer-account-gate";
import { EventUpdatedNotificationEmail } from "@/shared/emails/event-updated-notification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import {
  computeCancelTokenExpiresAt as computeEventCancelTokenExpiresAt,
  createCancelToken as createEventCancelToken,
} from "@/shared/lib/event-registration-cancel-token";
import { createCalendarToken } from "@/shared/lib/calendar/calendar-token";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import {
  createEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-status-token";
import { createMarketingUnsubscribeArtifacts } from "@/shared/lib/tokens/marketing-unsubscribe-token";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import {
  buildAddToCalendarUrls,
  buildEventCalendar,
  buildEventCancelCalendar,
} from "../ical";
import { omitUndefined } from "../serialize";
import { getAdminUrl } from "../admin-urls";
import { getAppHost, getAppUrl } from "../constants";
import { hashForKey, sendEmail } from "./send";
import type {
  EmailResult,
  EmailSendContext,
  EventAdminNotificationDelivery,
  EventBroadcastPayload,
  EventCancelledNotificationPayload,
  EventEmailRenderContext,
  EventUpdatedNotificationPayload,
} from "./types";

// =============================================================================
// Event Registration Emails
// =============================================================================

/**
 * 会員向けマイページのイベント申込詳細 URL を組み立てる。
 * customerId が無い（ゲスト申込）場合は undefined を返す。
 * waitlist / reminder 等からも参照される SSoT のため export する。
 */
export function buildMemberEventRegistrationUrl(
  customerId: string | null | undefined,
  registrationId: string,
): string | undefined {
  if (!customerId) return undefined;
  return `${getAppUrl()}/mypage/events/${registrationId}`;
}

/**
 * イベント申込詳細ハブ URL（メール本文の再確認 SSoT）。
 * 会員はマイページ詳細、ゲストは status token 付き薄い詳細ページ。
 * `buildBookingHubUrl`（予約）と対称。
 */
export function buildEventRegistrationHubUrl(
  customerId: string | null | undefined,
  registrationId: string,
): string {
  const memberUrl = buildMemberEventRegistrationUrl(customerId, registrationId);
  if (memberUrl) return memberUrl;
  const token = createEventRegistrationStatusToken(
    registrationId,
    new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS),
  );
  return `${getAppUrl()}/events/registrations/status?token=${token}`;
}

type EventRegistrationConfirmationData = {
  registrationId: string;
  customerName: string;
  // walk-in 由来 (当日参加) では null。null の場合は送信せず disabled を返す
  customerEmail: string | null;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: string | undefined;
  quantity: number;
  icsSequence: number;
  // customerId が非null（会員）の場合は claimUrl を生成しない
  customerId: string | null;
  format: EventFormatValue;
  meetingUrl: string | null;
  /** ゲスト向け: 有料チケットの Stripe Checkout 起動 URL (token 認可 route)。 */
  paymentCheckoutUrl?: string;
  /** 振込先表示 gate 用。省略時は UNPAID 扱い。 */
  paymentStatus?: PaymentStatus;
};

/**
 * イベント申込確認メールを送信
 *
 * customerEmail が null (walk-in 由来) の場合は送信せず disabled を返す。
 */
export async function sendEventRegistrationConfirmation(
  data: EventRegistrationConfirmationData,
  renderContext: EventEmailRenderContext,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  if (!data.customerEmail) return { ok: false, reason: "disabled" };
  const customerEmail = data.customerEmail;

  const eventDate = formatDateWithWeekday(data.eventStartTime);
  const startTime = formatTimeShort(data.eventStartTime);
  const endTime = formatTimeShort(data.eventEndTime);

  const { calendarSettings, organizer } = renderContext;
  const footer = await getEmailFooterData();
  const appUrl = getAppUrl();
  const host = getAppHost();

  const calendarParams = omitUndefined({
    registrationId: data.registrationId,
    eventTitle: data.eventTitle,
    customerName: data.customerName,
    startTime: data.eventStartTime,
    endTime: data.eventEndTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    quantity: data.quantity,
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
    format: data.format,
    meetingUrl: data.meetingUrl,
  });

  // ゲストでもログイン不要で .ics をダウンロードできるよう、署名付きトークンを URL に付与する。
  // 寿命は CALENDAR_TOKEN_LIFETIME_MS (30 日)。
  const icsDownloadUrl = `${appUrl}/api/calendar/event/${data.registrationId}?token=${createCalendarToken("event", data.registrationId)}`;

  // ゲスト申込のみ、マイページに申込を追加する claim リンクを発行する（会員は不要）。
  const claimUrl = data.customerId
    ? undefined
    : `${appUrl}/claim/event-registration?token=${createEventRegistrationClaimToken(data.registrationId)}`;
  const eventRegistrationHubUrl = buildEventRegistrationHubUrl(
    data.customerId,
    data.registrationId,
  );
  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? buildAddToCalendarUrls({
        summary: data.eventTitle,
        description: [
          `申込ID: ${data.registrationId.slice(0, 8).toUpperCase()}`,
          `イベント: ${data.eventTitle}`,
          `日時: ${eventDate} ${startTime} - ${endTime}`,
        ].join("\n"),
        startTime: data.eventStartTime,
        endTime: data.eventEndTime,
        ...(data.location !== undefined ? { location: data.location } : {}),
        icsDownloadUrl,
      })
    : undefined;

  // 期限内（スロット開始時刻まで・7 日 cap）のみ有効なゲストキャンセルトークン URL を発行。
  // 会員でも非会員でも cancelUrl は発行する（reservation-emails.ts と同方針）。
  const cancelDeadline = computeEventCancelTokenExpiresAt(data.eventStartTime);
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/events/cancel?token=${createEventCancelToken(data.registrationId, cancelDeadline)}`
      : undefined;

  // 領収書 DL CTA は確認メールに載せない。発行通知は `sendReceiptIssuedEmail` /
  // `notifyReceiptIssuedFor*` に集約する (payment-off / guest-status clean-break)。

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `event-${data.registrationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildEventCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateEventICalAttachment",
          registrationId: data.registrationId,
        },
      });
    }
  }

  const paymentStatus = data.paymentStatus ?? "UNPAID";
  const showTransferAccounts = shouldShowTransferAccounts({
    paymentFeatureEnabled: renderContext.paymentFeatureEnabled,
    paymentStatus,
    activeAccountCount: renderContext.transferAccounts.length,
  });

  return sendEmail(
    {
      payload: omitUndefined({
        to: customerEmail,
        subject: `【イベント申込確認】${data.eventTitle} - ${eventDate}`,
        react: EventRegistrationConfirmationEmail(
          omitUndefined({
            customerName: data.customerName,
            eventTitle: data.eventTitle,
            eventDate,
            startTime,
            endTime,
            location: data.location,
            format: data.format,
            meetingUrl: data.meetingUrl,
            quantity: data.quantity,
            registrationId: data.registrationId.slice(0, 8).toUpperCase(),
            addToCalendarLinks,
            eventRegistrationHubUrl,
            claimUrl,
            cancelUrl,
            paymentCheckoutUrl: data.paymentCheckoutUrl,
            ...(showTransferAccounts
              ? {
                  transferAccounts: renderContext.transferAccounts,
                  transferGuidance: renderContext.transferGuidance,
                }
              : {}),
            footer,
          }),
        ),
        attachments,
      }),
      idempotencyKey: `event-reg-confirm/${data.registrationId}`,
      operation: "sendEventRegistrationConfirmation",
      context: {
        registrationId: data.registrationId,
        customerEmail,
      },
    },
    sendContext,
  );
}

type EventReminderEmailData = {
  registrationId: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: string | undefined;
  quantity: number;
  icsSequence: number;
  // customerId が非null（会員）の場合は claimUrl を生成しない
  customerId: string | null;
  format: EventFormatValue;
  meetingUrl: string | null;
  /** cron リマインダ対象日（JST YYYY-MM-DD）。Resend idempotencyKey 用。 */
  reminderWindowDate: string;
};

/**
 * イベント前日リマインダーメールを送信（REQUEST ICS 添付）
 *
 * cron から申込単位でループ呼び出しされる想定（reservation-reminder と対称）。
 * 送信可否（Settings.notifyEventReminder）は呼び出し側の cron ルートで判定する。
 */
export async function sendEventReminderEmail(
  data: EventReminderEmailData,
  renderContext: EventEmailRenderContext,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const eventDate = formatDateWithWeekday(data.eventStartTime);
  const startTime = formatTimeShort(data.eventStartTime);
  const endTime = formatTimeShort(data.eventEndTime);

  const { calendarSettings, organizer } = renderContext;
  const footer = await getEmailFooterData();
  const host = getAppHost();
  const appUrl = getAppUrl();

  // ゲスト申込のみ、マイページに申込を追加する claim リンクを発行する（会員は不要）。
  const claimUrl = data.customerId
    ? undefined
    : `${getAppUrl()}/claim/event-registration?token=${createEventRegistrationClaimToken(data.registrationId)}`;
  const eventRegistrationHubUrl = buildEventRegistrationHubUrl(
    data.customerId,
    data.registrationId,
  );

  const calendarParams = omitUndefined({
    registrationId: data.registrationId,
    eventTitle: data.eventTitle,
    customerName: data.customerName,
    startTime: data.eventStartTime,
    endTime: data.eventEndTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    quantity: data.quantity,
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
    format: data.format,
    meetingUrl: data.meetingUrl,
  });

  // リマインダ送信時点でキャンセル期限内なら、キャンセル URL を再発行する。
  // 「リマインダにキャンセル URL が無い」と参加者が連絡無くキャンセルし得る運用上の
  // 穴を塞ぐ（reminder-emails.ts の予約リマインダと同方針）。
  const cancelDeadline = computeEventCancelTokenExpiresAt(data.eventStartTime);
  const cancelUrl =
    cancelDeadline > new Date()
      ? `${appUrl}/events/cancel?token=${createEventCancelToken(data.registrationId, cancelDeadline)}`
      : undefined;

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `event-${data.registrationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildEventCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateEventReminderICalAttachment",
          registrationId: data.registrationId,
        },
      });
    }
  }

  return sendEmail(
    {
      payload: omitUndefined({
        to: data.customerEmail,
        subject: `【イベント前日リマインダー】${data.eventTitle} - ${eventDate}`,
        react: EventReminderEmail(
          omitUndefined({
            customerName: data.customerName,
            eventTitle: data.eventTitle,
            eventDate,
            startTime,
            endTime,
            location: data.location,
            quantity: data.quantity,
            eventRegistrationHubUrl,
            claimUrl,
            cancelUrl,
            footer,
          }),
        ),
        attachments,
      }),
      idempotencyKey: `event-reminder/${data.registrationId}/${data.reminderWindowDate}`,
      operation: "sendEventReminderEmail",
      context: {
        registrationId: data.registrationId,
        customerEmail: data.customerEmail,
      },
    },
    sendContext,
  );
}

type EventRegistrationCancelledData = {
  registrationId: string;
  customerName: string;
  customerEmail: string | null;
  eventTitle: string;
  eventStartTime: Date;
  eventEndTime: Date;
  location: string | undefined;
  quantity: number;
  icsSequence: number;
  format: EventFormatValue;
  meetingUrl: string | null;
};

/**
 * イベント申込キャンセル確認メールを送信（CANCEL ICS 添付）
 *
 * customerEmail が null (walk-in 由来) の場合は送信せず disabled を返す。
 */
export async function sendEventRegistrationCancelled(
  data: EventRegistrationCancelledData,
  renderContext: EventEmailRenderContext,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  if (!data.customerEmail) return { ok: false, reason: "disabled" };
  const customerEmail = data.customerEmail;

  const eventDate = formatDateWithWeekday(data.eventStartTime);

  const { calendarSettings, organizer } = renderContext;
  const footer = await getEmailFooterData();
  const host = getAppHost();

  const calendarParams = omitUndefined({
    registrationId: data.registrationId,
    eventTitle: data.eventTitle,
    customerName: data.customerName,
    startTime: data.eventStartTime,
    endTime: data.eventEndTime,
    ...(data.location !== undefined ? { location: data.location } : {}),
    quantity: data.quantity,
    sequence: data.icsSequence,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
    format: data.format,
    meetingUrl: data.meetingUrl,
  });

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `event-cancel-${data.registrationId.slice(0, 8)}.ics`,
          content: Buffer.from(
            buildEventCancelCalendar(calendarParams, host),
            "utf-8",
          ),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateEventICalCancelAttachment",
          registrationId: data.registrationId,
        },
      });
    }
  }

  return sendEmail(
    {
      payload: omitUndefined({
        to: customerEmail,
        subject: `【イベント申込キャンセル】${data.eventTitle}`,
        react: EventRegistrationCancelledEmail({
          customerName: data.customerName,
          eventTitle: data.eventTitle,
          eventDate,
          footer,
        }),
        attachments,
      }),
      // icsSequence を含めることで、将来 restore path が追加されて 24h 内に同一
      // registration が再キャンセルされる可能性が生まれても idempotency key が
      // 衝突しないよう SSoT で対称化する（reservation-cancel と同方針）。
      idempotencyKey: `event-reg-cancel/${data.registrationId}/${data.icsSequence}`,
      operation: "sendEventRegistrationCancelled",
      context: {
        registrationId: data.registrationId,
        customerEmail,
      },
    },
    sendContext,
  );
}

type EventAdminNotificationData = {
  registrationId: string;
  eventId: string;
  participantName: string;
  // walk-in 由来は null。本文では「未登録 / 当日参加」と表示
  participantEmail: string | null;
  eventTitle: string;
  eventStartTime: Date;
  quantity: number;
  currentRegistrations: number;
  capacity: number | null;
};

/**
 * イベント申込に関する管理者通知メールを送信
 */
export async function sendEventAdminNotification(
  data: EventAdminNotificationData,
  type: "registration" | "waitlist_registration" | "cancellation",
  delivery: EventAdminNotificationDelivery,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  if (delivery.notificationEmails.length === 0) {
    return { ok: false, reason: "disabled" };
  }

  const footer = await getEmailFooterData();

  const eventDate = formatDateWithWeekday(data.eventStartTime);

  const actionText: string = {
    registration: "新規イベント申込",
    waitlist_registration: "イベントキャンセル待ち登録",
    cancellation: "イベント申込キャンセル",
  }[type];

  return sendEmail(
    {
      payload: {
        to: [...delivery.notificationEmails],
        subject: `【${actionText}】${data.eventTitle} - ${data.participantName}様`,
        react: EventAdminNotificationEmail({
          type,
          participantName: data.participantName,
          participantEmail: data.participantEmail,
          eventTitle: data.eventTitle,
          eventDate,
          quantity: data.quantity,
          currentRegistrations: data.currentRegistrations,
          capacity: data.capacity,
          adminUrl: getAdminUrl(`/events/${data.eventId}`),
          footer,
        }),
      },
      idempotencyKey: `event-admin/${data.registrationId}/${type}`,
      operation: "sendEventAdminNotification",
      context: {
        registrationId: data.registrationId,
        type,
      },
    },
    sendContext,
  );
}

/**
 * イベント中止時に全参加者へ通知メールを送信（CANCEL ICS 添付）
 */
export async function sendEventCancelledToAllParticipants(
  payload: EventCancelledNotificationPayload,
  renderContext: EventEmailRenderContext,
  sendContext: EmailSendContext,
  reason?: string,
): Promise<void> {
  const eventUpdatedAt = payload.updatedAt.getTime();

  const { calendarSettings, organizer } = renderContext;
  const footer = await getEmailFooterData();
  const host = getAppHost();

  // walk-in 由来 (email=null) は宛先が無いため除外
  const recipients = payload.registrations.filter(
    (r): r is typeof r & { email: string } => r.email !== null,
  );

  const results = await Promise.allSettled(
    recipients.map((registration) => {
      const startTime = registration.slot.startAt;
      const endTime = registration.slot.endAt;
      const eventDate = formatDateWithWeekday(startTime);
      const eventRegistrationHubUrl = buildEventRegistrationHubUrl(
        registration.customerId,
        registration.id,
      );
      let attachments: { filename: string; content: Buffer }[] | undefined;
      // CANCEL ICS は CONFIRMED (元々 REQUEST ICS を送っていた) 参加者のみに
      // 送る。WAITLISTED / WAITLISTED_OFFERED は既存のカレンダーエントリを
      // 持たないため CANCEL ICS を届けても取り消す対象が無い。
      if (
        calendarSettings.icalAttachmentEnabled &&
        registration.status === RegistrationStatus.CONFIRMED
      ) {
        try {
          const calendarParams = omitUndefined({
            registrationId: registration.id,
            eventTitle: payload.title,
            customerName: registration.name,
            startTime,
            endTime,
            ...(payload.venueDisplay !== null
              ? { location: payload.venueDisplay }
              : {}),
            quantity: registration.quantity,
            sequence: registration.icsSequence + 1,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
            format: payload.format,
            meetingUrl: payload.meetingUrl,
          });
          attachments = [
            {
              filename: `event-cancel-${registration.id.slice(0, 8)}.ics`,
              content: Buffer.from(
                buildEventCancelCalendar(calendarParams, host),
                "utf-8",
              ),
            },
          ];
        } catch {
          // ical generation failure is non-critical, continue without attachment
        }
      }

      return sendEmail(
        {
          payload: omitUndefined({
            to: registration.email,
            subject: `【イベント中止のお知らせ】${payload.title}`,
            react: EventCancelledNotificationEmail(
              omitUndefined({
                customerName: registration.name,
                eventTitle: payload.title,
                eventDate,
                reason,
                eventRegistrationHubUrl,
                footer,
              }),
            ),
            attachments,
          }),
          idempotencyKey: `event-cancelled/${payload.eventId}/${hashForKey(registration.email)}/${eventUpdatedAt}`,
          operation: "sendEventCancelledToAllParticipants",
          context: {
            eventId: payload.eventId,
            participantEmail: registration.email,
          },
        },
        sendContext,
      );
    }),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const registration = recipients[i];
      if (registration) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendEventCancelledToAllParticipants",
            eventId: payload.eventId,
            participantEmail: registration.email,
          },
        });
      }
    }
  }
}

/**
 * イベント内容変更時に全参加者へ通知メールを送信（REQUEST ICS 添付）
 *
 * `oldSlotStartTimes` は変更前の `EventTimeSlot.id -> startAt` の対応表。
 * TIMED_ENTRY イベントで複数スロットが存在する場合、各参加者には自分が
 * 申し込んだスロットの「変更前の日時」を表示する必要があるため、単一の
 * 代表値（例: 最初のスロット）を全員に使い回さずスロット単位で解決する。
 */
export async function sendEventUpdatedToAllParticipants(
  payload: EventUpdatedNotificationPayload,
  oldSlotStartTimes: ReadonlyMap<string, Date>,
  renderContext: EventEmailRenderContext,
  sendContext: EmailSendContext,
): Promise<void> {
  const eventUpdatedAt = payload.updatedAt.getTime();

  const { calendarSettings, organizer } = renderContext;
  const footer = await getEmailFooterData();
  const host = getAppHost();

  // walk-in 由来 (email=null) は宛先が無いため除外
  const recipients = payload.registrations.filter(
    (r): r is typeof r & { email: string } => r.email !== null,
  );

  const results = await Promise.allSettled(
    recipients.map((registration) => {
      const newStartTime = registration.slot.startAt;
      const newEndTimeDate = registration.slot.endAt;
      // 申込済みスロットは削除できない不変条件（syncEventTimeSlotsCommand）により
      // 必ず変更前の対応表に存在するはずだが、念のため新値へのフォールバックを備える。
      const oldStartTime =
        oldSlotStartTimes.get(registration.slotId) ?? newStartTime;
      const oldEventDate = `${formatDateWithWeekday(oldStartTime)} ${formatTimeShort(oldStartTime)}`;
      const oldStartTimestamp = oldStartTime.getTime();
      const newEventDate = `${formatDateWithWeekday(newStartTime)} ${formatTimeShort(newStartTime)}`;
      const newEndTime = formatTimeShort(newEndTimeDate);
      const eventRegistrationHubUrl = buildEventRegistrationHubUrl(
        registration.customerId,
        registration.id,
      );
      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (calendarSettings.icalAttachmentEnabled) {
        try {
          const calendarParams = omitUndefined({
            registrationId: registration.id,
            eventTitle: payload.title,
            customerName: registration.name,
            startTime: newStartTime,
            endTime: newEndTimeDate,
            ...(payload.venueDisplay !== null
              ? { location: payload.venueDisplay }
              : {}),
            quantity: registration.quantity,
            sequence: registration.icsSequence + 1,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
            format: payload.format,
            meetingUrl: payload.meetingUrl,
          });
          attachments = [
            {
              filename: `event-${registration.id.slice(0, 8)}.ics`,
              content: Buffer.from(
                buildEventCalendar(calendarParams, host),
                "utf-8",
              ),
            },
          ];
        } catch {
          // ical generation failure is non-critical, continue without attachment
        }
      }

      return sendEmail(
        {
          payload: omitUndefined({
            to: registration.email,
            subject: `【イベント内容変更のお知らせ】${payload.title}`,
            react: EventUpdatedNotificationEmail({
              customerName: registration.name,
              eventTitle: payload.title,
              eventDate: oldEventDate,
              newEventDate: `${newEventDate}〜${newEndTime}`,
              location: payload.venueDisplay ?? undefined,
              eventRegistrationHubUrl,
              footer,
            }),
            attachments,
          }),
          idempotencyKey: `event-updated/${payload.eventId}/${registration.slotId}/${oldStartTimestamp}/${eventUpdatedAt}/${hashForKey(registration.email)}`,
          operation: "sendEventUpdatedToAllParticipants",
          context: {
            eventId: payload.eventId,
            participantEmail: registration.email,
          },
        },
        sendContext,
      );
    }),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const registration = recipients[i];
      if (registration) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendEventUpdatedToAllParticipants",
            eventId: payload.eventId,
            participantEmail: registration.email,
          },
        });
      }
    }
  }
}

// =============================================================================
// Admin-authored broadcast (T12)
// =============================================================================

export type EventBroadcastResult = {
  ok: boolean;
  /** Resend への送信リクエストが成功した宛先数 (Resend の suppression により実配信されない可能性はある) */
  sent: number;
  /** email=null (walk-in) や status!=CONFIRMED でスキップされた申込数 */
  skipped: number;
};

/**
 * 管理者が任意の件名・本文で申込済み参加者全員へ一斉配信するメール送信関数 (T12)。
 *
 * `event-cancelled` / `event-updated` の自動発火型と同じ fan-out shape (Promise.allSettled
 * で個別失敗を分離) を踏襲する。設計上の判断:
 *
 * - **送信対象**: `status = CONFIRMED AND email !== null` の申込のみ。walk-in 由来
 *   (email=null) はメール送信対象外なので skipped にカウントする。WAITLISTED /
 *   CANCELLED は対象外 (キャンセル済み参加者に配信通知を送るのは spam)
 * - **idempotencyKey**: `event-broadcast/${eventId}/${hashForKey(email)}/${broadcastNonce}`。
 *   同一イベントの再配信でも Resend が silent drop しないよう broadcastNonce (呼出側
 *   の crypto.randomUUID) を混ぜる。event.updatedAt を使わない理由: broadcast は event
 *   本体を触らないため updatedAt が変わらず、複数回配信で idempotencyKey が衝突する
 * - **rate limit**: このレイヤでは実施しない (呼出側の Server Action で
 *   `eventBroadcastRateLimiter` を先に発火する)
 *
 * @returns `{ok, sent, skipped}` — 呼出側 (Server Action) が UI 表示や AuditLog metadata に
 *   使う。イベント自体が存在しない場合は `{ok: false, sent: 0, skipped: 0}`。
 */
export async function sendEventBroadcast(
  payload: EventBroadcastPayload,
  params: {
    subject: string;
    body: string;
    broadcastNonce: string;
  },
  sendContext: EmailSendContext,
): Promise<EventBroadcastResult> {
  if (payload.recipients.length === 0) {
    return { ok: true, sent: 0, skipped: payload.skipped };
  }

  const footer = await getEmailFooterData();
  const appUrl = getAppUrl();
  const eventUrl = `${appUrl}/events/${payload.slug}`;

  const results = await Promise.allSettled(
    payload.recipients.map((registration) => {
      const customerId =
        registration.customerId ??
        payload.customerIdByEmail.get(
          normalizeEmailForIdentity(registration.email),
        ) ??
        null;
      const unsubscribe =
        customerId !== null
          ? createMarketingUnsubscribeArtifacts(customerId)
          : null;

      return sendEmail(
        {
          payload: {
            to: registration.email,
            subject: params.subject,
            ...(unsubscribe !== null ? { headers: unsubscribe.headers } : {}),
            react: EventBroadcastEmail({
              eventTitle: payload.title,
              eventUrl,
              subject: params.subject,
              bodyText: params.body,
              ...(unsubscribe !== null
                ? { unsubscribeUrl: unsubscribe.url }
                : {}),
              footer,
            }),
          },
          idempotencyKey: `event-broadcast/${payload.eventId}/${hashForKey(registration.email)}/${params.broadcastNonce}`,
          operation: "sendEventBroadcast",
          context: {
            eventId: payload.eventId,
            participantEmail: registration.email,
          },
        },
        sendContext,
      );
    }),
  );

  let sent = 0;
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled" && result.value.ok) {
      sent += 1;
    } else if (result.status === "rejected") {
      const registration = payload.recipients[i];
      if (registration) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendEventBroadcast",
            eventId: payload.eventId,
            participantEmail: registration.email,
          },
        });
      }
    }
  }

  return { ok: true, sent, skipped: payload.skipped };
}
