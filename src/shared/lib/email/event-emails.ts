/**
 * イベント関連メール
 *
 * イベント申込確認、キャンセル通知、管理者通知、イベント中止通知、イベント変更通知メールの送信。
 *
 * @module shared/lib/email/event-emails
 */

import "server-only";
import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";
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
import { EventUpdatedNotificationEmail } from "@/shared/emails/event-updated-notification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { prisma } from "@/shared/db/prisma";
import {
  getCalendarEmailSettings,
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
} from "@/shared/domain/settings/queries/notification";
import { getIcalOrganizer } from "@/shared/domain/settings/queries/organization";
import { formatEventVenue } from "@/shared/domain/events/venue";
import {
  computeCancelTokenExpiresAt as computeEventCancelTokenExpiresAt,
  createCancelToken as createEventCancelToken,
} from "@/shared/lib/event-registration-cancel-token";
import { createCalendarToken } from "@/shared/lib/calendar/calendar-token";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
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
import type { EmailResult } from "./types";

// =============================================================================
// Event Registration Emails
// =============================================================================

/**
 * 会員向けマイページのイベント申込一覧 URL を組み立てる。
 * customerId が無い（ゲスト申込）場合は undefined を返す。
 * イベントには予約の [id] 詳細ページに相当するものが無いため一覧ページを指す。
 */
function buildMemberEventRegistrationUrl(
  customerId: string | null | undefined,
): string | undefined {
  if (!customerId) return undefined;
  return `${getAppUrl()}/mypage/events`;
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
};

/**
 * イベント申込確認メールを送信
 *
 * customerEmail が null (walk-in 由来) の場合は送信せず disabled を返す。
 */
export async function sendEventRegistrationConfirmation(
  data: EventRegistrationConfirmationData,
): Promise<EmailResult> {
  if (!data.customerEmail) return { ok: false, reason: "disabled" };
  const customerEmail = data.customerEmail;

  const eventDate = formatDateWithWeekday(data.eventStartTime);
  const startTime = formatTimeShort(data.eventStartTime);
  const endTime = formatTimeShort(data.eventEndTime);

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
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
  const memberEventRegistrationUrl = buildMemberEventRegistrationUrl(
    data.customerId,
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

  return sendEmail({
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
          memberEventRegistrationUrl,
          claimUrl,
          cancelUrl,
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
  });
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
};

/**
 * イベント前日リマインダーメールを送信（REQUEST ICS 添付）
 *
 * cron から申込単位でループ呼び出しされる想定（reservation-reminder と対称）。
 * 送信可否（Settings.notifyEventReminder）は呼び出し側の cron ルートで判定する。
 */
export async function sendEventReminderEmail(
  data: EventReminderEmailData,
): Promise<EmailResult> {
  const eventDate = formatDateWithWeekday(data.eventStartTime);
  const startTime = formatTimeShort(data.eventStartTime);
  const endTime = formatTimeShort(data.eventEndTime);

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();
  const appUrl = getAppUrl();

  // ゲスト申込のみ、マイページに申込を追加する claim リンクを発行する（会員は不要）。
  const claimUrl = data.customerId
    ? undefined
    : `${getAppUrl()}/claim/event-registration?token=${createEventRegistrationClaimToken(data.registrationId)}`;
  const memberEventRegistrationUrl = buildMemberEventRegistrationUrl(
    data.customerId,
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

  return sendEmail({
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
          memberEventRegistrationUrl,
          claimUrl,
          cancelUrl,
          footer,
        }),
      ),
      attachments,
    }),
    idempotencyKey: `event-reminder/${data.registrationId}`,
    operation: "sendEventReminderEmail",
    context: {
      registrationId: data.registrationId,
      customerEmail: data.customerEmail,
    },
  });
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
): Promise<EmailResult> {
  if (!data.customerEmail) return { ok: false, reason: "disabled" };
  const customerEmail = data.customerEmail;

  const eventDate = formatDateWithWeekday(data.eventStartTime);

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
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

  return sendEmail({
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
    idempotencyKey: `event-reg-cancel/${data.registrationId}`,
    operation: "sendEventRegistrationCancelled",
    context: {
      registrationId: data.registrationId,
      customerEmail,
    },
  });
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
): Promise<EmailResult> {
  const toggles = await getEmailDeliverySettings();
  // Record 網羅で type 追加漏れを compile-time に検知させる。
  const enabledByType: boolean = {
    registration: toggles.notifyEventRegistration,
    waitlist_registration: toggles.notifyEventWaitlistRegistration,
    cancellation: toggles.notifyEventCancellation,
  }[type];
  if (!enabledByType) return { ok: false, reason: "disabled" };

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();

  const eventDate = formatDateWithWeekday(data.eventStartTime);

  const actionText: string = {
    registration: "新規イベント申込",
    waitlist_registration: "イベントキャンセル待ち登録",
    cancellation: "イベント申込キャンセル",
  }[type];

  return sendEmail({
    payload: {
      to: notificationEmails,
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
  });
}

/**
 * イベント中止時に全参加者へ通知メールを送信（CANCEL ICS 添付）
 */
export async function sendEventCancelledToAllParticipants(
  eventId: string,
  reason?: string,
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      format: true,
      meetingUrl: true,
      updatedAt: true,
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          id: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
          customerId: true,
          slot: {
            select: { startAt: true, endAt: true },
          },
        },
      },
    },
  });

  if (!event) return;

  const venueDisplay = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });

  // event の updatedAt を idempotency key に混ぜることで、24h 内に同一イベントを
  // 再キャンセル相当の更新があっても payload 差異で Resend が silent drop しない。
  const eventUpdatedAt = event.updatedAt.getTime();

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();

  // walk-in 由来 (email=null) は宛先が無いため除外
  const recipients = event.registrations.filter(
    (r): r is typeof r & { email: string } => r.email !== null,
  );

  const results = await Promise.allSettled(
    recipients.map((registration) => {
      const startTime = registration.slot.startAt;
      const endTime = registration.slot.endAt;
      const eventDate = formatDateWithWeekday(startTime);
      const memberEventRegistrationUrl = buildMemberEventRegistrationUrl(
        registration.customerId,
      );
      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (calendarSettings.icalAttachmentEnabled) {
        try {
          const calendarParams = omitUndefined({
            registrationId: registration.id,
            eventTitle: event.title,
            customerName: registration.name,
            startTime,
            endTime,
            ...(venueDisplay !== null ? { location: venueDisplay } : {}),
            quantity: registration.quantity,
            sequence: registration.icsSequence + 1,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
            format: event.format,
            meetingUrl: event.meetingUrl,
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

      return sendEmail({
        payload: omitUndefined({
          to: registration.email,
          subject: `【イベント中止のお知らせ】${event.title}`,
          react: EventCancelledNotificationEmail(
            omitUndefined({
              customerName: registration.name,
              eventTitle: event.title,
              eventDate,
              reason,
              memberEventRegistrationUrl,
              footer,
            }),
          ),
          attachments,
        }),
        idempotencyKey: `event-cancelled/${eventId}/${hashForKey(registration.email)}/${eventUpdatedAt}`,
        operation: "sendEventCancelledToAllParticipants",
        context: {
          eventId,
          participantEmail: registration.email,
        },
      });
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
            eventId,
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
  eventId: string,
  oldSlotStartTimes: ReadonlyMap<string, Date>,
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      format: true,
      meetingUrl: true,
      updatedAt: true,
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          id: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
          slotId: true,
          customerId: true,
          slot: {
            select: { startAt: true, endAt: true },
          },
        },
      },
    },
  });

  if (!event) return;

  const venueDisplay = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });

  // 同一 oldStartTime のまま他のフィールド (タイトル/場所/etc.) のみ更新されても
  // idempotency key を分離するため event.updatedAt も混ぜる。event-cancelled と対称。
  const eventUpdatedAt = event.updatedAt.getTime();

  const [calendarSettings, organizer, footer] = await Promise.all([
    getCalendarEmailSettings(),
    getIcalOrganizer(),
    getEmailFooterData(),
  ]);
  const host = getAppHost();

  // walk-in 由来 (email=null) は宛先が無いため除外
  const recipients = event.registrations.filter(
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
      const memberEventRegistrationUrl = buildMemberEventRegistrationUrl(
        registration.customerId,
      );
      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (calendarSettings.icalAttachmentEnabled) {
        try {
          const calendarParams = omitUndefined({
            registrationId: registration.id,
            eventTitle: event.title,
            customerName: registration.name,
            startTime: newStartTime,
            endTime: newEndTimeDate,
            ...(venueDisplay !== null ? { location: venueDisplay } : {}),
            quantity: registration.quantity,
            sequence: registration.icsSequence + 1,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
            format: event.format,
            meetingUrl: event.meetingUrl,
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

      return sendEmail({
        payload: omitUndefined({
          to: registration.email,
          subject: `【イベント内容変更のお知らせ】${event.title}`,
          react: EventUpdatedNotificationEmail({
            customerName: registration.name,
            eventTitle: event.title,
            eventDate: oldEventDate,
            newEventDate: `${newEventDate}〜${newEndTime}`,
            location: venueDisplay ?? undefined,
            ...(memberEventRegistrationUrl !== undefined
              ? { memberEventRegistrationUrl }
              : {}),
            footer,
          }),
          attachments,
        }),
        idempotencyKey: `event-updated/${eventId}/${registration.slotId}/${oldStartTimestamp}/${eventUpdatedAt}/${hashForKey(registration.email)}`,
        operation: "sendEventUpdatedToAllParticipants",
        context: {
          eventId,
          participantEmail: registration.email,
        },
      });
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
            eventId,
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
  eventId: string,
  params: {
    subject: string;
    body: string;
    broadcastNonce: string;
  },
): Promise<EventBroadcastResult> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      title: true,
      slug: true,
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!event) return { ok: false, sent: 0, skipped: 0 };

  const totalRegistrations = event.registrations.length;
  // walk-in 由来 (email=null) は宛先が無いため除外し skipped にカウント
  const recipients = event.registrations.filter(
    (r): r is typeof r & { email: string } => r.email !== null,
  );
  const skipped = totalRegistrations - recipients.length;

  if (recipients.length === 0) {
    // 送信対象 0 でも ok は true とする (UI 表示は sent=0 で reflect される)
    return { ok: true, sent: 0, skipped };
  }

  const footer = await getEmailFooterData();
  const appUrl = getAppUrl();
  const eventUrl = `${appUrl}/events/${event.slug}`;

  const results = await Promise.allSettled(
    recipients.map((registration) =>
      sendEmail({
        payload: {
          to: registration.email,
          subject: params.subject,
          react: EventBroadcastEmail({
            eventTitle: event.title,
            eventUrl,
            subject: params.subject,
            bodyText: params.body,
            footer,
          }),
        },
        idempotencyKey: `event-broadcast/${eventId}/${hashForKey(registration.email)}/${params.broadcastNonce}`,
        operation: "sendEventBroadcast",
        context: {
          eventId,
          participantEmail: registration.email,
        },
      }),
    ),
  );

  let sent = 0;
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled" && result.value.ok) {
      sent += 1;
    } else if (result.status === "rejected") {
      const registration = recipients[i];
      if (registration) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendEventBroadcast",
            eventId,
            participantEmail: registration.email,
          },
        });
      }
    }
  }

  return { ok: true, sent, skipped };
}
