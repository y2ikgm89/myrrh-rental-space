/**
 * イベント waitlist 系の管理者 in-app 通知（OFFERED / CONFIRMED）の SSoT。
 *
 * 繰り上げ当選・確定は admin 手動 / キャンセル駆動 / cron / 公開 confirm /
 * Stripe webhook など複数経路があるため、registrationId から表示文言を解決して
 * 1 箇所に集約する（メール送信と同型の「経路ごとに duplicate しない」方針）。
 *
 * @module shared/domain/events/waitlist-admin-notification-side-effects
 */

import "server-only";

import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { prisma } from "@/shared/db/prisma";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

async function loadRegistrationNotificationContext(
  registrationId: string,
): Promise<{
  participantName: string;
  eventId: string;
  eventTitle: string;
} | null> {
  const row = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      name: true,
      eventId: true,
      event: { select: { title: true } },
    },
  });
  if (!row) return null;
  return {
    participantName: row.name,
    eventId: row.eventId,
    eventTitle: row.event.title,
  };
}

/** 繰り上げ当選 (WAITLISTED → WAITLISTED_OFFERED) 後の管理者 in-app 通知。 */
export async function notifyEventWaitlistOfferedForRegistration(
  registrationId: string,
): Promise<void> {
  const ctx = await loadRegistrationNotificationContext(registrationId);
  if (!ctx) return;

  await createNotificationCommand({
    type: NOTIFICATION_TYPE.EVENT_WAITLIST_OFFERED,
    title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_WAITLIST_OFFERED],
    message: `${ctx.participantName}様が「${ctx.eventTitle}」で繰り上げ当選しました`,
    resourceType: "event",
    resourceId: ctx.eventId,
  });
}

/** キャンセル待ち確定 (WAITLISTED_OFFERED → CONFIRMED) 後の管理者 in-app 通知。 */
export async function notifyEventWaitlistConfirmedForRegistration(
  registrationId: string,
): Promise<void> {
  const ctx = await loadRegistrationNotificationContext(registrationId);
  if (!ctx) return;

  await createNotificationCommand({
    type: NOTIFICATION_TYPE.EVENT_WAITLIST_CONFIRMED,
    title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_WAITLIST_CONFIRMED],
    message: `${ctx.participantName}様が「${ctx.eventTitle}」のキャンセル待ちを確定しました`,
    resourceType: "event",
    resourceId: ctx.eventId,
  });
}

export function fireEventWaitlistOfferedAdminNotification(
  registrationId: string,
): void {
  fireAndForget(notifyEventWaitlistOfferedForRegistration(registrationId), {
    operation: "createEventWaitlistOfferedNotification",
    category: ErrorCategory.DATABASE,
  });
}

export function fireEventWaitlistConfirmedAdminNotification(
  registrationId: string,
): void {
  fireAndForget(notifyEventWaitlistConfirmedForRegistration(registrationId), {
    operation: "createEventWaitlistConfirmedNotification",
    category: ErrorCategory.DATABASE,
  });
}
