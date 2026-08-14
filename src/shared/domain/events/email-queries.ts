import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatEventVenue } from "@/shared/lib/events/venue";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import type {
  EventBroadcastPayload,
  EventCancelledNotificationPayload,
  EventUpdatedNotificationPayload,
} from "@/shared/lib/email/types";

export type {
  EventBroadcastPayload,
  EventCancelledNotificationPayload,
  EventUpdatedNotificationPayload,
} from "@/shared/lib/email/types";

/**
 * イベント中止通知メール (`sendEventCancelledToAllParticipants`) 用 payload。
 */
export async function getEventCancelledNotificationPayload(
  eventId: string,
): Promise<EventCancelledNotificationPayload | null> {
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
        where: {
          status: {
            in: [
              RegistrationStatus.CONFIRMED,
              RegistrationStatus.WAITLISTED_OFFERED,
              RegistrationStatus.WAITLISTED,
            ],
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
          customerId: true,
          status: true,
          slot: {
            select: { startAt: true, endAt: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  return {
    eventId,
    title: event.title,
    format: event.format,
    meetingUrl: event.meetingUrl,
    updatedAt: event.updatedAt,
    venueDisplay: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    registrations: event.registrations,
  };
}

/**
 * イベント内容変更通知メール (`sendEventUpdatedToAllParticipants`) 用 payload。
 */
export async function getEventUpdatedNotificationPayload(
  eventId: string,
): Promise<EventUpdatedNotificationPayload | null> {
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

  if (!event) return null;

  return {
    eventId,
    title: event.title,
    format: event.format,
    meetingUrl: event.meetingUrl,
    updatedAt: event.updatedAt,
    venueDisplay: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    registrations: event.registrations,
  };
}

/**
 * 管理者オーサリング型 event broadcast (`sendEventBroadcast`) 用 payload。
 */
export async function getEventBroadcastPayload(
  eventId: string,
): Promise<EventBroadcastPayload | null> {
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
          customerId: true,
        },
      },
    },
  });

  if (!event) return null;

  const totalRegistrations = event.registrations.length;
  const withEmail = event.registrations.filter(
    (r): r is typeof r & { email: string } => r.email !== null,
  );

  const unresolvedEmails = [
    ...new Set(
      withEmail
        .filter((r) => r.customerId === null)
        .map((r) => normalizeEmailForIdentity(r.email)),
    ),
  ];
  const customersByEmail =
    unresolvedEmails.length > 0
      ? await prisma.customer.findMany({
          where: { emailCanonical: { in: unresolvedEmails } },
          select: { id: true, emailCanonical: true },
        })
      : [];
  const customerIdByEmail = new Map(
    customersByEmail.map((c) => [c.emailCanonical, c.id]),
  );

  // **配信停止を守れる相手にしか送らない**（監査 F-45）。
  //
  // 一斉配信のメールには List-Unsubscribe / List-Unsubscribe-Post: One-Click と
  // 本文の「配信停止はこちら」が付く。押すと `marketingOptIn=false` になり、
  // 確認画面は「今後、運営からのお知らせ・キャンペーンメールは配信されません」と
  // 表示する。ところが旧実装の where は `status=CONFIRMED` だけで、次の配信でまた
  // 届いていた。顧客一斉配信（`findCustomersForBroadcast`）は `marketingOptIn: true`
  // で絞っており、非対称だった。
  //
  // Gmail / Yahoo の bulk sender 要件（配信停止を honor すること）を満たさないと、
  // spam 報告 → COMPLAINED → `getSuppressedEmailSet` 経由で**予約確認や領収書など
  // 取引メールまで全停止**する。
  //
  // Customer に解決できない walk-in / ゲストも送らない。unsubscribe URL を出せない
  // ＝ 押されても記録できない相手に、守れない配信停止を提示しないため。
  // 「ヘッダを出せるか」と「送ってよいか」を 1 つの述語に揃える。
  const candidateCustomerIds = [
    ...new Set(
      withEmail
        .map(
          (r) =>
            r.customerId ??
            customerIdByEmail.get(normalizeEmailForIdentity(r.email)) ??
            null,
        )
        .filter((id): id is string => id !== null),
    ),
  ];
  const optedInCustomerIds = new Set(
    candidateCustomerIds.length > 0
      ? (
          await prisma.customer.findMany({
            where: { id: { in: candidateCustomerIds }, marketingOptIn: true },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [],
  );

  const recipients = withEmail.filter((r) => {
    const customerId =
      r.customerId ??
      customerIdByEmail.get(normalizeEmailForIdentity(r.email)) ??
      null;
    return customerId !== null && optedInCustomerIds.has(customerId);
  });
  const skipped = totalRegistrations - recipients.length;

  return {
    eventId,
    title: event.title,
    slug: event.slug,
    recipients,
    skipped,
    customerIdByEmail,
  };
}
