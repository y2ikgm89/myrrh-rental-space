/**
 * イベント関連メール
 *
 * イベント申込確認、キャンセル通知、管理者通知、イベント中止通知、イベント変更通知メールの送信。
 *
 * @module shared/lib/email/event-emails
 */

import "server-only";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { EventAdminNotificationEmail } from "@/shared/emails/event-admin-notification";
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

  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.eventStartTime, "HH:mm", { locale: ja });
  const endTime = format(data.eventEndTime, "HH:mm", { locale: ja });

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
  });

  // ゲストでもログイン不要で .ics をダウンロードできるよう、署名付きトークンを URL に付与する。
  // 寿命は CALENDAR_TOKEN_LIFETIME_MS (30 日)。
  const icsDownloadUrl = `${appUrl}/api/calendar/event/${data.registrationId}?token=${createCalendarToken("event", data.registrationId)}`;

  // ゲスト申込のみ、マイページに申込を追加する claim リンクを発行する（会員は不要）。
  const claimUrl = data.customerId
    ? undefined
    : `${appUrl}/claim/event-registration?token=${createEventRegistrationClaimToken(data.registrationId)}`;
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
          quantity: data.quantity,
          registrationId: data.registrationId.slice(0, 8).toUpperCase(),
          addToCalendarLinks,
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
  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.eventStartTime, "HH:mm", { locale: ja });
  const endTime = format(data.eventEndTime, "HH:mm", { locale: ja });

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

  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

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
  type: "registration" | "cancellation",
): Promise<EmailResult> {
  const toggles = await getEmailDeliverySettings();
  const enabledByType =
    type === "registration"
      ? toggles.notifyEventRegistration
      : toggles.notifyEventCancellation;
  if (!enabledByType) return { ok: false, reason: "disabled" };

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();

  const eventDate = format(data.eventStartTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });

  const actionText =
    type === "registration" ? "新規イベント申込" : "イベント申込キャンセル";

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
      const eventDate = format(startTime, "yyyy年M月d日 (EEEE)", {
        locale: ja,
      });
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
      const oldEventDate = format(oldStartTime, "yyyy年M月d日 (EEEE) HH:mm", {
        locale: ja,
      });
      const oldStartTimestamp = oldStartTime.getTime();
      const newEventDate = format(newStartTime, "yyyy年M月d日 (EEEE) HH:mm", {
        locale: ja,
      });
      const newEndTime = format(newEndTimeDate, "HH:mm", { locale: ja });
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
